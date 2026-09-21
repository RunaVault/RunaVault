console.error = jest.fn();
process.env.TABLE_PREFIX = "Test_";

import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { mockClient } from "aws-sdk-client-mock";
import "aws-sdk-client-mock-jest";

const mockFormatResponse = jest.fn((statusCode, body) => ({ statusCode, body: JSON.stringify(body) }));
const mockParseBody = jest.fn();

jest.mock("/opt/utils.js", () => ({
  __esModule: true,
  formatResponse: mockFormatResponse,
  parseBody: mockParseBody,
}), { virtual: true });

const mockWriteAuditLog = jest.fn(() => Promise.resolve());

jest.mock("/opt/authz.js", () => {
  const actual = jest.requireActual("../layers/nodejs/authz.js");
  return {
    __esModule: true,
    getAuthContext: jest.fn(),
    generateMachineToken: actual.generateMachineToken,
    normalizeIpToCidr: actual.normalizeIpToCidr,
    parseDurationToSeconds: actual.parseDurationToSeconds,
    writeAuditLog: mockWriteAuditLog,
    ALLOWED_SCOPES: actual.ALLOWED_SCOPES,
  };
}, { virtual: true });

let handler;
let mockGetAuthContext;
const ddbMock = mockClient(DynamoDBClient);

beforeAll(async () => {
  const authzMock = await import("/opt/authz.js");
  mockGetAuthContext = authzMock.getAuthContext;
  handler = (await import("../auth_token_create/index.js")).handler;
});

beforeEach(() => {
  ddbMock.reset();
  mockFormatResponse.mockClear();
  mockParseBody.mockReset();
  mockWriteAuditLog.mockClear();
  mockGetAuthContext.mockReset().mockReturnValue({ authType: "cognito", userId: "user-1" });
});

const event = (body) => ({ body: JSON.stringify(body), requestContext: { http: { sourceIp: "203.0.113.1" } } });

describe("auth_token_create", () => {
  it("rejects machine tokens - only humans can mint machine tokens", async () => {
    mockGetAuthContext.mockReturnValue({ authType: "machine", userId: "owner-1" });
    await handler(event({ name: "ci" }));
    expect(mockFormatResponse).toHaveBeenCalledWith(403, { message: "Forbidden" });
    expect(ddbMock).not.toHaveReceivedCommand(PutItemCommand);
  });

  it("rejects an invalid name", async () => {
    mockParseBody.mockReturnValue({ name: "bad/name!" });
    await handler(event({ name: "bad/name!" }));
    const [status] = mockFormatResponse.mock.calls[0];
    expect(status).toBe(400);
  });

  it("rejects an unsupported scope", async () => {
    mockParseBody.mockReturnValue({ name: "ci", scopes: ["secrets:write"] });
    await handler(event({}));
    expect(mockFormatResponse).toHaveBeenCalledWith(400, { message: "Unsupported scope: secrets:write" });
  });

  it("rejects a malformed expiresIn", async () => {
    mockParseBody.mockReturnValue({ name: "ci", expiresIn: "banana" });
    await handler(event({}));
    const [status, body] = mockFormatResponse.mock.calls[0];
    expect(status).toBe(400);
    expect(body.message).toMatch(/expiresIn/);
  });

  it("rejects an invalid secret path pattern", async () => {
    mockParseBody.mockReturnValue({ name: "ci", secretPaths: ["prod; rm -rf /"] });
    await handler(event({}));
    const [status] = mockFormatResponse.mock.calls[0];
    expect(status).toBe(400);
  });

  it("rejects a garbage IP address", async () => {
    mockParseBody.mockReturnValue({ name: "ci", ipAddresses: ["not-an-ip"] });
    await handler(event({}));
    expect(mockFormatResponse).toHaveBeenCalledWith(400, { message: "Invalid IP address or CIDR range" });
  });

  it("creates a token, stores only the hash, and returns the plaintext exactly once", async () => {
    ddbMock.on(PutItemCommand).resolves({});
    mockParseBody.mockReturnValue({
      name: "github-actions",
      scopes: ["secrets:read"],
      expiresIn: "30d",
      secretPaths: ["production/*"],
      ipAddresses: ["203.0.113.10"],
    });

    await handler(event({}));

    expect(ddbMock).toHaveReceivedCommandTimes(PutItemCommand, 1);
    const putInput = ddbMock.commandCalls(PutItemCommand)[0].args[0].input;
    expect(putInput.Item.token_hash.S).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(putInput)).not.toContain("rv_live_");
    expect(putInput.Item.allowed_secret_paths.SS).toEqual(["production/*"]);
    expect(putInput.Item.allowed_ip_cidrs.SS).toEqual(["203.0.113.10/32"]);

    const [status, body] = mockFormatResponse.mock.calls[0];
    expect(status).toBe(200);
    expect(body.token).toMatch(/^rv_live_/);
    expect(body.warning).toMatch(/will not be shown again/);
    expect(mockWriteAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "token.create", success: true }));
  });

  it("defaults to unrestricted paths/IPs and the default scope when none are given", async () => {
    ddbMock.on(PutItemCommand).resolves({});
    mockParseBody.mockReturnValue({ name: "local-dev" });

    await handler(event({}));

    const putInput = ddbMock.commandCalls(PutItemCommand)[0].args[0].input;
    expect(putInput.Item.scopes.SS).toEqual(["secrets:read"]);
    expect(putInput.Item.allowed_secret_paths.SS).toEqual(["NONE"]);
    expect(putInput.Item.allowed_ip_cidrs.SS).toEqual(["NONE"]);
    expect(putInput.Item.expires_at).toBeUndefined();
  });
});
