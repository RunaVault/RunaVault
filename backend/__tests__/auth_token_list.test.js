console.error = jest.fn();
process.env.TABLE_PREFIX = "Test_";

import { DynamoDBClient, QueryCommand } from "@aws-sdk/client-dynamodb";
import { mockClient } from "aws-sdk-client-mock";
import "aws-sdk-client-mock-jest";

const mockFormatResponse = jest.fn((statusCode, body) => ({ statusCode, body: JSON.stringify(body) }));
jest.mock("/opt/utils.js", () => ({ __esModule: true, formatResponse: mockFormatResponse }), { virtual: true });

const mockGetAuthContext = jest.fn();
jest.mock("/opt/authz.js", () => ({ __esModule: true, getAuthContext: mockGetAuthContext }), { virtual: true });

let handler;
const ddbMock = mockClient(DynamoDBClient);

beforeAll(async () => {
  handler = (await import("../auth_token_list/index.js")).handler;
});

beforeEach(() => {
  ddbMock.reset();
  mockFormatResponse.mockClear();
  mockGetAuthContext.mockReset().mockReturnValue({ authType: "cognito", userId: "user-1" });
});

describe("auth_token_list", () => {
  it("rejects machine tokens", async () => {
    mockGetAuthContext.mockReturnValue({ authType: "machine", userId: "owner-1" });
    await handler({});
    expect(mockFormatResponse).toHaveBeenCalledWith(403, { message: "Forbidden" });
  });

  it("lists only the caller's own tokens, never the token hash", async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [
        {
          token_id: { S: "tok-1" },
          name: { S: "github-actions" },
          status: { S: "active" },
          created_at: { S: "2026-01-01T00:00:00.000Z" },
          expires_at: { S: "2026-02-01T00:00:00.000Z" },
          last_used_at: { S: "" },
          scopes: { SS: ["secrets:read"] },
          allowed_secret_paths: { SS: ["production/*"] },
          allowed_ip_cidrs: { SS: ["NONE"] },
          token_hash: { S: "deadbeef" },
        },
      ],
    });

    await handler({});

    expect(ddbMock).toHaveReceivedCommandWith(QueryCommand, {
      TableName: "Test_machine_tokens",
      KeyConditionExpression: "owner_id = :owner_id",
      ExpressionAttributeValues: { ":owner_id": { S: "user-1" } },
    });

    const [status, body] = mockFormatResponse.mock.calls[0];
    expect(status).toBe(200);
    expect(body.tokens).toHaveLength(1);
    expect(body.tokens[0]).toEqual({
      tokenId: "tok-1",
      name: "github-actions",
      status: "active",
      createdAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-02-01T00:00:00.000Z",
      lastUsedAt: null,
      scopes: ["secrets:read"],
      secretPaths: ["production/*"],
      ipAddresses: [],
    });
    expect(JSON.stringify(body)).not.toContain("deadbeef");
  });
});
