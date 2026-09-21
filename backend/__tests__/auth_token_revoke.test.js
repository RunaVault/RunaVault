console.error = jest.fn();
process.env.TABLE_PREFIX = "Test_";

import { DynamoDBClient, GetItemCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { mockClient } from "aws-sdk-client-mock";
import "aws-sdk-client-mock-jest";

const mockFormatResponse = jest.fn((statusCode, body) => ({ statusCode, body: JSON.stringify(body) }));
jest.mock("/opt/utils.js", () => ({ __esModule: true, formatResponse: mockFormatResponse }), { virtual: true });

const mockGetAuthContext = jest.fn();
const mockWriteAuditLog = jest.fn(() => Promise.resolve());
jest.mock("/opt/authz.js", () => ({
  __esModule: true,
  getAuthContext: mockGetAuthContext,
  writeAuditLog: mockWriteAuditLog,
}), { virtual: true });

let handler;
const ddbMock = mockClient(DynamoDBClient);

beforeAll(async () => {
  handler = (await import("../auth_token_revoke/index.js")).handler;
});

beforeEach(() => {
  ddbMock.reset();
  mockFormatResponse.mockClear();
  mockWriteAuditLog.mockClear();
  mockGetAuthContext.mockReset().mockReturnValue({ authType: "cognito", userId: "user-1" });
});

describe("auth_token_revoke", () => {
  it("rejects machine tokens", async () => {
    mockGetAuthContext.mockReturnValue({ authType: "machine", userId: "owner-1" });
    await handler({ pathParameters: { tokenId: "tok-1" } });
    expect(mockFormatResponse).toHaveBeenCalledWith(403, { message: "Forbidden" });
  });

  it("404s when the token doesn't belong to the caller (or doesn't exist)", async () => {
    ddbMock.on(GetItemCommand).resolves({});
    await handler({ pathParameters: { tokenId: "someone-elses-token" } });
    expect(mockFormatResponse).toHaveBeenCalledWith(404, { message: "Token not found" });
    expect(ddbMock).not.toHaveReceivedCommand(UpdateItemCommand);
  });

  it("scopes the lookup to the caller's own owner_id partition", async () => {
    ddbMock.on(GetItemCommand).resolves({ Item: { name: { S: "ci" } } });
    ddbMock.on(UpdateItemCommand).resolves({});
    await handler({ pathParameters: { tokenId: "tok-1" }, requestContext: { http: { sourceIp: "1.2.3.4" } } });

    expect(ddbMock).toHaveReceivedCommandWith(GetItemCommand, {
      Key: { owner_id: { S: "user-1" }, token_id: { S: "tok-1" } },
    });
  });

  it("revokes an owned, active token", async () => {
    ddbMock.on(GetItemCommand).resolves({ Item: { name: { S: "ci" } } });
    ddbMock.on(UpdateItemCommand).resolves({});

    await handler({ pathParameters: { tokenId: "tok-1" }, requestContext: { http: { sourceIp: "1.2.3.4" } } });

    expect(ddbMock).toHaveReceivedCommandWith(UpdateItemCommand, {
      Key: { owner_id: { S: "user-1" }, token_id: { S: "tok-1" } },
      UpdateExpression: "SET #status = :revoked",
      ExpressionAttributeValues: { ":revoked": { S: "revoked" } },
    });
    expect(mockFormatResponse).toHaveBeenCalledWith(200, { message: "Token revoked", tokenId: "tok-1" });
    expect(mockWriteAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "token.revoke", success: true }));
  });
});
