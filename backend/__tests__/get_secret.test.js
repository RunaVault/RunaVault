// Set TABLE_PREFIX at the very top to ensure it's used everywhere
process.env.TABLE_PREFIX = "RunaVault_Test_";

let handler;
import { DynamoDBClient, GetItemCommand, QueryCommand } from "@aws-sdk/client-dynamodb";
import { KMSClient, DecryptCommand } from "@aws-sdk/client-kms";
import { mockClient } from "aws-sdk-client-mock";
import "aws-sdk-client-mock-jest";

const mockFormatResponse = jest.fn((statusCode, body) => ({
  statusCode,
  body: JSON.stringify(body),
  headers: { "Content-Type": "application/json" },
}));
const mockParseBody = jest.fn();

jest.mock("/opt/utils.js", () => ({
  __esModule: true,
  formatResponse: mockFormatResponse,
  parseBody: mockParseBody,
}), { virtual: true });

const mockGetAuthContext = jest.fn();
const mockRequireScope = jest.fn(() => true);
const mockIsSecretPathAllowed = jest.fn(() => true);
const mockWriteAuditLog = jest.fn(() => Promise.resolve());

jest.mock("/opt/authz.js", () => ({
  __esModule: true,
  getAuthContext: mockGetAuthContext,
  requireScope: mockRequireScope,
  isSecretPathAllowed: mockIsSecretPathAllowed,
  toSecretPath: (site, subdirectory) =>
    subdirectory && subdirectory !== "default" ? `${subdirectory}/${site}` : site,
  writeAuditLog: mockWriteAuditLog,
}), { virtual: true });

const ddbMock = mockClient(DynamoDBClient);
const kmsMock = mockClient(KMSClient);

const cognitoCtx = (overrides = {}) => ({
  authType: "cognito",
  userId: "test-user-id",
  groups: [],
  scopes: [],
  allowedSecretPaths: [],
  tokenId: null,
  ...overrides,
});

describe("GetSecret Handler", () => {
  beforeAll(async () => {
    const module = await import("../get_secret/index.js");
    handler = module.handler;
  });

  beforeEach(() => {
    ddbMock.reset();
    kmsMock.reset();
    mockFormatResponse.mockClear();
    mockParseBody.mockClear();
    mockGetAuthContext.mockReset().mockReturnValue(cognitoCtx());
    mockRequireScope.mockReset().mockReturnValue(true);
    mockIsSecretPathAllowed.mockReset().mockReturnValue(true);
    mockWriteAuditLog.mockClear();
  });

  test("should return 403 if authorizer context has no userId", async () => {
    mockGetAuthContext.mockReturnValue(cognitoCtx({ userId: null }));
    const event = { headers: {} };

    await handler(event);

    expect(mockFormatResponse).toHaveBeenCalledWith(403, { message: "Forbidden - Invalid Token" });
  });

  test("should return 400 if 'site' is missing in request body", async () => {
    const event = { headers: {}, body: JSON.stringify({}) };
    mockParseBody.mockReturnValue({});

    await handler(event);
    expect(mockFormatResponse).toHaveBeenCalledWith(400, { message: "Missing site parameter" });
  });

  test("should return 403 when the caller lacks secrets:read scope", async () => {
    mockRequireScope.mockReturnValue(false);
    const event = { headers: {}, body: JSON.stringify({ site: "example.com" }) };
    mockParseBody.mockReturnValue({ site: "example.com" });

    await handler(event);
    expect(mockFormatResponse).toHaveBeenCalledWith(403, { message: "Forbidden" });
    expect(ddbMock).not.toHaveReceivedCommand(GetItemCommand);
  });

  test("should return 403 when the secret path is outside the token's allowed paths", async () => {
    mockIsSecretPathAllowed.mockReturnValue(false);
    const event = { headers: {}, body: JSON.stringify({ site: "example.com" }) };
    mockParseBody.mockReturnValue({ site: "example.com" });

    await handler(event);
    expect(mockFormatResponse).toHaveBeenCalledWith(403, { message: "Forbidden" });
  });

  test("should return 200 with ciphertext on successful direct retrieval (no subdirectory)", async () => {
    const mockUserId = "test-user-id";
    const mockSite = "example.com";
    const mockUsername = "user@example.com";
    const mockPasswordData = { encryptedPassword: "encryptedPass", sharedWith: {} };

    mockGetAuthContext.mockReturnValue(cognitoCtx({ userId: mockUserId }));
    const event = { headers: {}, body: JSON.stringify({ site: mockSite }) };
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

    expect(mockFormatResponse).toHaveBeenCalledWith(200, {
      site: mockSite,
      username: mockUsername,
      subdirectory: "default",
      password: JSON.stringify(mockPasswordData),
    });
    expect(kmsMock).not.toHaveReceivedCommand(DecryptCommand);
  });

  test("should return 200 with ciphertext on successful group share retrieval", async () => {
    const mockUserId = "test-user-id";
    const mockSite = "group-site.com";
    const mockSubdirectory = "shared";
    const mockGroupId = "group1";
    const ownerOfSharedSecret = "owner-user-id";
    const mockUsername = "sharedUser";
    const originalPasswordData = {
      encryptedPassword: "originalOwnerPassword",
      sharedWith: {
        groups: [{ groupId: mockGroupId, encryptedPassword: "groupSpecificEncryptedPassword" }]
      }
    };

    mockGetAuthContext.mockReturnValue(cognitoCtx({ userId: mockUserId, groups: [mockGroupId, "group2"] }));
    const event = { headers: {}, body: JSON.stringify({ site: mockSite, subdirectory: mockSubdirectory }) };
    mockParseBody.mockReturnValue({ site: mockSite, subdirectory: mockSubdirectory });

    ddbMock.on(GetItemCommand, {
      TableName: `${process.env.TABLE_PREFIX}passwords`,
      Key: { user_id: { S: mockUserId }, site: { S: `${mockSite}#${mockSubdirectory}` } }
    }).resolves({});
    ddbMock.on(QueryCommand, {
      TableName: `${process.env.TABLE_PREFIX}passwords`,
      KeyConditionExpression: "user_id = :user_id AND site = :site",
      ExpressionAttributeValues: { ":user_id": { S: mockUserId }, ":site": { S: `${mockSite}#${mockSubdirectory}` } }
    }).resolves({ Items: [] });
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

    expect(mockFormatResponse).toHaveBeenCalledWith(200, {
      site: mockSite,
      username: mockUsername,
      subdirectory: mockSubdirectory,
      password: JSON.stringify(originalPasswordData),
    });
  });

  test("should return 404 if secret is not found directly or via group share", async () => {
    const mockUserId = "test-user-id";
    const mockSite = "nonexistent-site.com";

    mockGetAuthContext.mockReturnValue(cognitoCtx({ userId: mockUserId, groups: ["group1"] }));
    const event = { headers: {}, body: JSON.stringify({ site: mockSite }) };
    mockParseBody.mockReturnValue({ site: mockSite });

    ddbMock.on(GetItemCommand).resolves({});
    ddbMock.on(QueryCommand, {
      TableName: `${process.env.TABLE_PREFIX}passwords`,
      KeyConditionExpression: "user_id = :user_id AND site = :site",
      ExpressionAttributeValues: { ":user_id": { S: mockUserId }, ":site": { S: mockSite } },
    }).resolves({ Items: [] });
    ddbMock.on(QueryCommand, {
      TableName: `${process.env.TABLE_PREFIX}passwords`,
      IndexName: "shared_with_groups-index",
      KeyConditionExpression: "shared_with_groups = :group_id",
      FilterExpression: "subdirectory = :subdirectory",
      ExpressionAttributeValues: {
        ":group_id": { S: "group1" },
        ":subdirectory": { S: "default" },
      },
    }).resolves({ Items: [] });

    await handler(event);

    expect(mockFormatResponse).toHaveBeenCalledWith(404, { message: "Password not found" });
  });

  test("should return 500 if direct item is found but password data is incomplete", async () => {
    const mockUserId = "test-user-id";
    const mockSite = "incomplete-data.com";

    mockGetAuthContext.mockReturnValue(cognitoCtx({ userId: mockUserId }));
    const event = { headers: {}, body: JSON.stringify({ site: mockSite }) };
    mockParseBody.mockReturnValue({ site: mockSite });

    ddbMock.on(GetItemCommand).resolves({
      Item: {
        user_id: { S: mockUserId },
        site: { S: mockSite },
        username: { S: "testuser" },
      }
    });

    await handler(event);
    expect(mockFormatResponse).toHaveBeenCalledWith(500, { message: "Secret data is incomplete in the database" });
  });

  test("plaintext=true decrypts the owner's own ciphertext server-side", async () => {
    const mockUserId = "test-user-id";
    const mockSite = "example.com";

    mockGetAuthContext.mockReturnValue(cognitoCtx({ userId: mockUserId }));
    const event = { headers: {}, body: JSON.stringify({ site: mockSite, plaintext: true }) };
    mockParseBody.mockReturnValue({ site: mockSite, plaintext: true });

    ddbMock.on(GetItemCommand, {
      TableName: `${process.env.TABLE_PREFIX}passwords`,
      Key: { user_id: { S: mockUserId }, site: { S: mockSite } },
    }).resolves({
      Item: {
        user_id: { S: mockUserId },
        site: { S: mockSite },
        username: { S: "user@example.com" },
        password: { S: JSON.stringify({ encryptedPassword: Buffer.from("ciphertext").toString("base64"), sharedWith: { users: [], groups: [] } }) },
        subdirectory: { S: "default" },
      }
    });
    kmsMock.on(DecryptCommand).resolves({ Plaintext: Buffer.from("super-secret-value") });

    await handler(event);

    expect(kmsMock).toHaveReceivedCommandWith(DecryptCommand, {
      EncryptionContext: { purpose: "password-manager" },
    });
    expect(mockFormatResponse).toHaveBeenCalledWith(200, {
      site: mockSite,
      username: "user@example.com",
      subdirectory: "default",
      secret: "super-secret-value",
    });
  });

  test("plaintext=true selects the caller's group-specific ciphertext and context", async () => {
    const mockUserId = "member-user-id";
    const mockSite = "group-site.com";
    const mockGroupId = "group1";

    mockGetAuthContext.mockReturnValue(cognitoCtx({ userId: mockUserId, groups: [mockGroupId] }));
    const event = { headers: {}, body: JSON.stringify({ site: mockSite, plaintext: true }) };
    mockParseBody.mockReturnValue({ site: mockSite, plaintext: true });

    ddbMock.on(GetItemCommand).resolves({});
    ddbMock.on(QueryCommand, {
      TableName: `${process.env.TABLE_PREFIX}passwords`,
      KeyConditionExpression: "user_id = :user_id AND site = :site",
      ExpressionAttributeValues: { ":user_id": { S: mockUserId }, ":site": { S: mockSite } },
    }).resolves({ Items: [] });
    ddbMock.on(QueryCommand, {
      TableName: `${process.env.TABLE_PREFIX}passwords`,
      IndexName: "shared_with_groups-index",
    }).resolves({
      Items: [{
        user_id: { S: "owner-id" },
        site: { S: mockSite },
        username: { S: "owner@example.com" },
        password: { S: JSON.stringify({
          encryptedPassword: "b3duZXItY2lwaGVy",
          sharedWith: { groups: [{ groupId: mockGroupId, encryptedPassword: "Z3JvdXAtY2lwaGVy" }] }
        }) },
        subdirectory: { S: "default" },
      }]
    });
    kmsMock.on(DecryptCommand).resolves({ Plaintext: Buffer.from("group-secret") });

    await handler(event);

    expect(kmsMock).toHaveReceivedCommandWith(DecryptCommand, {
      EncryptionContext: { groupId: mockGroupId, purpose: "password-manager" },
    });
    expect(mockFormatResponse).toHaveBeenCalledWith(200, expect.objectContaining({ secret: "group-secret" }));
  });

  test("should return 500 when KMS decryption fails", async () => {
    const mockUserId = "test-user-id";
    const mockSite = "example.com";

    mockGetAuthContext.mockReturnValue(cognitoCtx({ userId: mockUserId }));
    const event = { headers: {}, body: JSON.stringify({ site: mockSite, plaintext: true }) };
    mockParseBody.mockReturnValue({ site: mockSite, plaintext: true });

    ddbMock.on(GetItemCommand).resolves({
      Item: {
        user_id: { S: mockUserId },
        site: { S: mockSite },
        username: { S: "user@example.com" },
        password: { S: JSON.stringify({ encryptedPassword: "Y2lwaGVy", sharedWith: {} }) },
        subdirectory: { S: "default" },
      }
    });
    kmsMock.on(DecryptCommand).rejects(new Error("KMS unavailable"));

    await handler(event);

    expect(mockFormatResponse).toHaveBeenCalledWith(500, { message: "KMS unavailable" });
  });
});
