// Set TABLE_PREFIX at the very top to ensure it's used everywhere
process.env.TABLE_PREFIX = "RunaVault_Test_";
// We'll import the handler dynamically to ensure mocks are set up first
let handler;
import { DynamoDBClient, GetItemCommand, QueryCommand } from "@aws-sdk/client-dynamodb";
import { mockClient } from "aws-sdk-client-mock";
import "aws-sdk-client-mock-jest"; // Extends jest expect

// Mock the utils layer
// jest.mock must be at the top level
const mockVerifyToken = jest.fn();
const mockFormatResponse = jest.fn((statusCode, body) => ({
  statusCode,
  body: JSON.stringify(body),
  headers: { "Content-Type": "application/json" },
}));
const mockParseBody = jest.fn();
const mockGetAuthToken = jest.fn();

jest.mock("/opt/utils.js", () => ({
  __esModule: true,
  verifyToken: mockVerifyToken,
  formatResponse: mockFormatResponse,
  parseBody: mockParseBody,
  getAuthToken: mockGetAuthToken,
}), { virtual: true });

const ddbMock = mockClient(DynamoDBClient);

describe("GetSecret Handler", () => {
  beforeAll(async () => {
    // Import the handler after mocks are set up
    const module = await import("../get_secret/index.js");
    handler = module.handler;
  });

  beforeEach(() => {
    ddbMock.reset();
    // Clear call counts and reset implementations for our /opt/utils.js mocks
    mockVerifyToken.mockClear().mockResolvedValue(undefined); 
    mockFormatResponse.mockClear();
    mockParseBody.mockClear();
    mockGetAuthToken.mockClear().mockReturnValue("valid-token");
    // TABLE_PREFIX is now set at the top and does not need to be set here
  });

  test("should return 401 if auth token is missing", async () => {
    mockGetAuthToken.mockImplementation(() => {
      throw new Error("Unauthorized: Missing token");
    });

    const event = { headers: {} };
    await handler(event);

    expect(mockFormatResponse).toHaveBeenCalledWith(401, { message: "Unauthorized: Missing token" });
  });

  test("should return 403 if verifyToken fails", async () => {
    mockVerifyToken.mockImplementation(() => {
      throw new Error("Forbidden: Invalid token signature");
    });
    
    const event = { headers: { Authorization: "Bearer invalid-token" } };
    await handler(event);
    expect(mockFormatResponse).toHaveBeenCalledWith(403, { message: "Forbidden: Invalid token signature" });
  });

  test("should return 403 if user claims (sub) are missing", async () => {
    const event = {
      headers: { Authorization: "Bearer valid-token" },
      requestContext: {
        authorizer: {
          jwt: {
            claims: { "cognito:groups": ["group1"] } // No 'sub'
          }
        }
      },
      body: JSON.stringify({ site: "example.com" })
    };
    mockParseBody.mockReturnValue({ site: "example.com" });

    await handler(event);
    expect(mockFormatResponse).toHaveBeenCalledWith(403, { message: "Forbidden - Invalid Token" });
  });
  
  test("should return 400 if 'site' is missing in request body", async () => {
    const event = {
      headers: { Authorization: "Bearer valid-token" },
      requestContext: { authorizer: { jwt: { claims: { sub: "test-user-id" } } } },
      body: JSON.stringify({}), // Empty body
    };
    mockParseBody.mockReturnValue({}); // parseBody returns empty object

    await handler(event);
    expect(mockFormatResponse).toHaveBeenCalledWith(400, { message: "Missing site parameter" });
  });

  test("should return 200 with secret on successful direct retrieval (no subdirectory)", async () => {
    const mockUserId = "test-user-id";
    const mockSite = "example.com";
    const mockUsername = "user@example.com";
    const mockPasswordData = { encryptedPassword: "encryptedPass", sharedWith: {} };
    
    const event = {
      headers: { Authorization: "Bearer valid-token" },
      requestContext: {
        authorizer: {
          jwt: {
            claims: { sub: mockUserId, "cognito:groups": [] }
          }
        }
      },
      body: JSON.stringify({ site: mockSite })
    };
    mockParseBody.mockReturnValue({ site: mockSite });

    ddbMock.on(GetItemCommand, {
      TableName: `${process.env.TABLE_PREFIX}passwords`,
      Key: { user_id: { S: mockUserId }, site: { S: mockSite } },
    }).resolves({
      Item: {
        user_id: { S: mockUserId },
        site: { S: mockSite },
        username: { S: mockUsername },
        password: { S: JSON.stringify(mockPasswordData) },
        subdirectory: { S: "default" }
      }
    });

    await handler(event);

    expect(ddbMock).toHaveReceivedCommandWith(GetItemCommand, {TableName: `${process.env.TABLE_PREFIX}passwords`, Key: { user_id: { S: mockUserId }, site: { S: mockSite } }});
    expect(mockFormatResponse).toHaveBeenCalledWith(200, {
      site: mockSite,
      username: mockUsername,
      subdirectory: "default",
      password: JSON.stringify(mockPasswordData),
    });
  });

  test("should return 200 with secret on successful direct retrieval (with subdirectory)", async () => {
    const mockUserId = "test-user-id";
    const mockSite = "example.com";
    const mockSubdirectory = "work";
    const mockCompositeKey = `${mockSite}#${mockSubdirectory}`;
    const mockUsername = "user@example.com";
    const mockPasswordData = { encryptedPassword: "encryptedPass", sharedWith: {} };

    const event = {
      headers: { Authorization: "Bearer valid-token" },
      requestContext: {
        authorizer: {
          jwt: {
            claims: { sub: mockUserId, "cognito:groups": [] }
          }
        }
      },
      body: JSON.stringify({ site: mockSite, subdirectory: mockSubdirectory })
    };
    mockParseBody.mockReturnValue({ site: mockSite, subdirectory: mockSubdirectory });

    ddbMock.on(GetItemCommand, {
      TableName: `${process.env.TABLE_PREFIX}passwords`,
      Key: { user_id: { S: mockUserId }, site: { S: mockCompositeKey } },
    }).resolves({
      Item: {
        user_id: { S: mockUserId },
        site: { S: mockCompositeKey },
        username: { S: mockUsername },
        password: { S: JSON.stringify(mockPasswordData) },
        subdirectory: { S: mockSubdirectory }
      }
    });

    await handler(event);
    expect(ddbMock).toHaveReceivedCommandWith(GetItemCommand, {TableName: `${process.env.TABLE_PREFIX}passwords`, Key: { user_id: { S: mockUserId }, site: { S: mockCompositeKey } }});
    expect(mockFormatResponse).toHaveBeenCalledWith(200, {
      site: mockSite,
      username: mockUsername,
      subdirectory: mockSubdirectory,
      password: JSON.stringify(mockPasswordData),
    });
  });

  test("should return 200 with secret on successful group share retrieval (string array groups)", async () => {
    const mockUserId = "test-user-id";
    const mockSite = "group-site.com";
    const mockSubdirectory = "shared";
    const mockGroupId = "group1";
    const ownerOfSharedSecret = "owner-user-id";
    const mockUsername = "sharedUser";
    const groupEncryptedPassword = "groupSpecificEncryptedPassword";
    const originalPasswordData = { 
        encryptedPassword: "originalOwnerPassword", 
        sharedWith: { 
            groups: [{ groupId: mockGroupId, encryptedPassword: groupEncryptedPassword }]
        } 
    };
    
    const event = {
      headers: { Authorization: "Bearer valid-token" },
      requestContext: {
        authorizer: {
          jwt: {
            claims: { sub: mockUserId, "cognito:groups": [mockGroupId, "group2"] }
          }
        }
      },
      body: JSON.stringify({ site: mockSite, subdirectory: mockSubdirectory })
    };
    mockParseBody.mockReturnValue({ site: mockSite, subdirectory: mockSubdirectory });

    // Direct secret not found
    ddbMock.on(GetItemCommand, {
      TableName: `${process.env.TABLE_PREFIX}passwords`,
      Key: { user_id: { S: mockUserId }, site: { S: `${mockSite}#${mockSubdirectory}` } }
    }).resolves({});
    // Direct group query returns empty
    ddbMock.on(QueryCommand, {
      TableName: `${process.env.TABLE_PREFIX}passwords`,
      KeyConditionExpression: "user_id = :user_id AND site = :site",
      ExpressionAttributeValues: { ":user_id": { S: mockUserId }, ":site": { S: `${mockSite}#${mockSubdirectory}` } }
    }).resolves({ Items: [] });
    // Group share query returns the group secret
    ddbMock.on(QueryCommand, {
      TableName: `${process.env.TABLE_PREFIX}passwords`,
      IndexName: "shared_with_groups-index",
      KeyConditionExpression: "shared_with_groups = :group_id",
      FilterExpression: "subdirectory = :subdirectory",
      ExpressionAttributeValues: {
        ":group_id": { S: mockGroupId },
        ":subdirectory": { S: mockSubdirectory },
      },
    }).resolves({
      Items: [{
        user_id: { S: ownerOfSharedSecret },
        site: { S: `${mockSite}#${mockSubdirectory}` }, 
        username: { S: mockUsername },
        password: { S: JSON.stringify(originalPasswordData) },
        subdirectory: { S: mockSubdirectory },
        shared_with_groups: { SS: [mockGroupId] } 
      }]
    });

    await handler(event);

    expect(ddbMock).toHaveReceivedCommandTimes(GetItemCommand, 1);
    expect(ddbMock).toHaveReceivedCommandTimes(QueryCommand, 2);
    expect(mockFormatResponse).toHaveBeenCalledWith(200, {
      site: mockSite,
      username: mockUsername,
      subdirectory: mockSubdirectory,
      password: JSON.stringify({
          encryptedPassword: groupEncryptedPassword,
          sharedWith: originalPasswordData.sharedWith
      }),
    });
  });
  
  test("should return 404 if secret is not found directly or via group share", async () => {
    const mockUserId = "test-user-id";
    const mockSite = "nonexistent-site.com";
    
    const event = {
      headers: { Authorization: "Bearer valid-token" },
      requestContext: {
        authorizer: {
          jwt: {
            claims: { sub: mockUserId, "cognito:groups": ["group1"] }
          }
        }
      },
      body: JSON.stringify({ site: mockSite })
    };
    mockParseBody.mockReturnValue({ site: mockSite });

    ddbMock.on(GetItemCommand, {
      TableName: `${process.env.TABLE_PREFIX}passwords`,
      Key: { user_id: { S: mockUserId }, site: { S: mockSite } },
    }).resolves({});
    // First QueryCommand: direct group query
    ddbMock.on(QueryCommand, {
      TableName: `${process.env.TABLE_PREFIX}passwords`,
      KeyConditionExpression: "user_id = :user_id AND site = :site",
      ExpressionAttributeValues: { ":user_id": { S: mockUserId }, ":site": { S: mockSite } },
    }).resolves({ Items: [] });
    // Second QueryCommand: group share query for "group1"
    ddbMock.on(QueryCommand, {
      TableName: `${process.env.TABLE_PREFIX}passwords`,
      IndexName: "shared_with_groups-index",
      KeyConditionExpression: "shared_with_groups = :group_id",
      FilterExpression: "subdirectory = :subdirectory",
      ExpressionAttributeValues: {
        ":group_id": { S: "group1" }, // From event.requestContext.authorizer.jwt.claims["cognito:groups"][0]
        ":subdirectory": { S: "default" }, // Default subdirectory when not provided in body
      },
    }).resolves({ Items: [] });

    await handler(event);

    expect(ddbMock).toHaveReceivedCommandTimes(GetItemCommand, 1);
    expect(ddbMock).toHaveReceivedCommandTimes(QueryCommand, 2);
    expect(mockFormatResponse).toHaveBeenCalledWith(404, { message: "Password not found" });
  });

  test("should correctly parse space-separated string for cognito:groups and find secret", async () => {
    const mockUserId = "test-user-id";
    const mockSite = "group-site-spacestring.com";
    const mockGroupId = "groupAlpha";
    const ownerOfSharedSecret = "owner-user-id";
    const mockUsername = "sharedUserSpace";
    const groupEncryptedPassword = "groupAlphaSpecificPassword";
    const originalPasswordData = { 
        encryptedPassword: "originalOwnerPassword", 
        sharedWith: { 
            groups: [{ groupId: mockGroupId, encryptedPassword: groupEncryptedPassword }]
        } 
    };
    
    const event = {
      headers: { Authorization: "Bearer valid-token" },
      requestContext: {
        authorizer: {
          jwt: {
            claims: { sub: mockUserId, "cognito:groups": "groupBeta  groupAlpha groupGamma" } 
          }
        }
      },
      body: JSON.stringify({ site: mockSite, subdirectory: "default" })
    };
    mockParseBody.mockReturnValue({ site: mockSite, subdirectory: "default" });

    const groupBetaEncryptedPassword = "groupBetaSpecificPassword";
    const groupBetaOriginalPasswordData = { 
        encryptedPassword: "originalOwnerPasswordForBeta", 
        sharedWith: { 
        groups: [{ groupId: "groupBeta", encryptedPassword: groupBetaEncryptedPassword }]
    } 
    };
    const groupBetaSecretItem = {
    user_id: { S: ownerOfSharedSecret },
    site: { S: `${mockSite}#default` }, 
    username: { S: mockUsername },
    password: { S: JSON.stringify(groupBetaOriginalPasswordData) },
        subdirectory: { S: "default" },
        shared_with_groups: { SS: ["groupBeta"] }
    };

    // Direct secret not found
    ddbMock.on(GetItemCommand, {
    TableName: `${process.env.TABLE_PREFIX}passwords`,
    Key: { user_id: { S: mockUserId }, site: { S: mockSite } },
    }).resolves({});
    // Direct group query returns empty
    ddbMock.on(QueryCommand, {
        TableName: `${process.env.TABLE_PREFIX}passwords`,
      KeyConditionExpression: "user_id = :user_id AND site = :site",
    ExpressionAttributeValues: { ":user_id": { S: mockUserId }, ":site": { S: mockSite } },
    }).resolves({ Items: [] });

    // groupBeta returns the secret
    ddbMock.on(QueryCommand, {
    TableName: `${process.env.TABLE_PREFIX}passwords`,
      IndexName: "shared_with_groups-index",
        KeyConditionExpression: "shared_with_groups = :group_id",
        FilterExpression: "subdirectory = :subdirectory",
        ExpressionAttributeValues: {
            ":group_id": { S: "groupBeta" },
           ":subdirectory": { S: "default" },
    },
    }).resolves({ Items: [groupBetaSecretItem] });
    
    // groupAlpha returns empty
    ddbMock.on(QueryCommand, {
    TableName: `${process.env.TABLE_PREFIX}passwords`,
    IndexName: "shared_with_groups-index",
    KeyConditionExpression: "shared_with_groups = :group_id",
        FilterExpression: "subdirectory = :subdirectory",
        ExpressionAttributeValues: {
            ":group_id": { S: "groupAlpha" }, // mockGroupId is 'groupAlpha'
            ":subdirectory": { S: "default" },
        },
    }).resolves({ Items: [] });
    
    // groupGamma returns empty (handler should stop after finding secret with groupBeta)
     ddbMock.on(QueryCommand, {
    TableName: `${process.env.TABLE_PREFIX}passwords`,
        IndexName: "shared_with_groups-index",
        KeyConditionExpression: "shared_with_groups = :group_id",
        FilterExpression: "subdirectory = :subdirectory",
      ExpressionAttributeValues: {
          ":group_id": { S: "groupGamma" },
          ":subdirectory": { S: "default" },
      },
    }).resolves({ Items: [] });

    await handler(event);

    // 1st QueryCommand is direct group, 2nd is groupBeta
    expect(ddbMock).toHaveReceivedNthSpecificCommandWith(2, QueryCommand, {
        TableName: `${process.env.TABLE_PREFIX}passwords`,
        IndexName: "shared_with_groups-index",
        KeyConditionExpression: "shared_with_groups = :group_id",
        FilterExpression: "subdirectory = :subdirectory",
        ExpressionAttributeValues: { ":group_id": { S: "groupBeta" }, ":subdirectory": { S: "default" } }
    });
    // Handler should not query for groupAlpha or groupGamma if groupBeta finds the secret
    expect(ddbMock).not.toHaveReceivedCommandWith(QueryCommand, {
        ExpressionAttributeValues: { ":group_id": { S: "groupAlpha" }, ":subdirectory": { S: "default" } }
    });
    expect(ddbMock).not.toHaveReceivedCommandWith(QueryCommand, {
        ExpressionAttributeValues: { ":group_id": { S: "groupGamma" }, ":subdirectory": { S: "default" } }
    });
    
    expect(mockFormatResponse).toHaveBeenCalledWith(200, {
      site: mockSite,
      username: mockUsername,
      subdirectory: "default",
      password: JSON.stringify({
        encryptedPassword: groupBetaEncryptedPassword,
        sharedWith: groupBetaOriginalPasswordData.sharedWith
      }),
    });
  });

  test("should return 500 if direct item is found but password data is incomplete", async () => {
    const mockUserId = "test-user-id";
    const mockSite = "incomplete-data.com";

    const event = {
      headers: { Authorization: "Bearer valid-token" },
      requestContext: { authorizer: { jwt: { claims: { sub: mockUserId } } } },
      body: JSON.stringify({ site: mockSite })
    };
    mockParseBody.mockReturnValue({ site: mockSite });

    ddbMock.on(GetItemCommand).resolves({
      Item: {
        user_id: { S: mockUserId },
        site: { S: mockSite },
        username: { S: "testuser" },
        // Missing password.S or it's malformed
      }
    });

    await handler(event);
    expect(mockFormatResponse).toHaveBeenCalledWith(500, { message: "Secret data is incomplete in the database" });
  });

});

