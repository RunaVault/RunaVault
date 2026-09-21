console.error = jest.fn();
process.env.TABLE_PREFIX = "Test_";

import { DynamoDBClient, GetItemCommand, PutItemCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { mockClient } from "aws-sdk-client-mock";
import "aws-sdk-client-mock-jest";

const mockFormatResponse = jest.fn((statusCode, body) => ({ statusCode, body: JSON.stringify(body) }));
jest.mock("/opt/utils.js", () => ({ __esModule: true, formatResponse: mockFormatResponse }), { virtual: true });

const mockGetAuthContext = jest.fn();
const mockWriteAuditLog = jest.fn(() => Promise.resolve());

jest.mock("/opt/authz.js", () => {
  const actual = jest.requireActual("../layers/nodejs/authz.js");
  return {
    __esModule: true,
    getAuthContext: mockGetAuthContext,
    generateMachineToken: actual.generateMachineToken,
    writeAuditLog: mockWriteAuditLog,
  };
}, { virtual: true });

let handler;
const ddbMock = mockClient(DynamoDBClient);

beforeAll(async () => {
  handler = (await import("../auth_token_rotate/index.js")).handler;
});

beforeEach(() => {
  ddbMock.reset();
  mockFormatResponse.mockClear();
  mockWriteAuditLog.mockClear();
  mockGetAuthContext.mockReset().mockReturnValue({ authType: "cognito", userId: "user-1" });
});

const existingActiveToken = {
  token_id: { S: "tok-old" },
  owner_id: { S: "user-1" },
  name: { S: "github-actions" },
  status: { S: "active" },
  scopes: { SS: ["secrets:read"] },
  allowed_secret_paths: { SS: ["production/*"] },
  allowed_ip_cidrs: { SS: ["NONE"] },
};

describe("auth_token_rotate", () => {
  it("rejects machine tokens", async () => {
    mockGetAuthContext.mockReturnValue({ authType: "machine", userId: "owner-1" });
    await handler({ pathParameters: { tokenId: "tok-old" } });
    expect(mockFormatResponse).toHaveBeenCalledWith(403, { message: "Forbidden" });
  });

  it("404s for a token the caller doesn't own", async () => {
    ddbMock.on(GetItemCommand).resolves({});
    await handler({ pathParameters: { tokenId: "not-mine" } });
    expect(mockFormatResponse).toHaveBeenCalledWith(404, { message: "Token not found" });
  });

  it("refuses to rotate an already-revoked token", async () => {
    ddbMock.on(GetItemCommand).resolves({ Item: { ...existingActiveToken, status: { S: "revoked" } } });
    await handler({ pathParameters: { tokenId: "tok-old" } });
    expect(mockFormatResponse).toHaveBeenCalledWith(400, { message: "Only active tokens can be rotated" });
  });

  it("issues a new token and revokes the old one, without a window where both stay live indefinitely", async () => {
    ddbMock.on(GetItemCommand).resolves({ Item: existingActiveToken });
    ddbMock.on(PutItemCommand).resolves({});
    ddbMock.on(UpdateItemCommand).resolves({});

    await handler({ pathParameters: { tokenId: "tok-old" }, requestContext: { http: { sourceIp: "1.2.3.4" } } });

    const putInput = ddbMock.commandCalls(PutItemCommand)[0].args[0].input;
    expect(putInput.Item.token_id.S).not.toBe("tok-old");
    expect(putInput.Item.scopes.SS).toEqual(["secrets:read"]);
    expect(putInput.Item.allowed_secret_paths.SS).toEqual(["production/*"]);

    expect(ddbMock).toHaveReceivedCommandWith(UpdateItemCommand, {
      Key: { owner_id: { S: "user-1" }, token_id: { S: "tok-old" } },
      ExpressionAttributeValues: { ":revoked": { S: "revoked" } },
    });

    const [status, body] = mockFormatResponse.mock.calls[0];
    expect(status).toBe(200);
    expect(body.token).toMatch(/^rv_live_/);
    expect(body.revokedTokenId).toBe("tok-old");
    expect(mockWriteAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "token.rotate" }));
  });
});
