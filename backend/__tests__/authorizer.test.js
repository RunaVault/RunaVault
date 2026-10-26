/**
 * Tests for the dual-mode (Cognito JWT / machine token) Lambda authorizer.
 */
console.error = jest.fn();

process.env.TABLE_PREFIX = "Test_";
process.env.USER_POOL_CLIENT_ID = "test-client-id";
process.env.COGNITO_ISSUER = "https://cognito-idp.us-east-1.amazonaws.com/test-pool";

import { DynamoDBClient, QueryCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { mockClient } from "aws-sdk-client-mock";
import "aws-sdk-client-mock-jest";

const mockGetAuthToken = jest.fn();
const mockVerifyCognitoToken = jest.fn();

jest.mock("/opt/utils.js", () => ({
  __esModule: true,
  getAuthToken: mockGetAuthToken,
  verifyCognitoToken: mockVerifyCognitoToken,
}), { virtual: true });

const mockWriteAuditLog = jest.fn(() => Promise.resolve());

jest.mock("/opt/authz.js", () => {
  const actual = jest.requireActual("../layers/nodejs/authz.js");
  return {
    __esModule: true,
    isMachineToken: actual.isMachineToken,
    hashToken: actual.hashToken,
    isIpAllowed: actual.isIpAllowed,
    writeAuditLog: mockWriteAuditLog,
  };
}, { virtual: true });

let handler;
const ddbMock = mockClient(DynamoDBClient);

beforeAll(async () => {
  handler = (await import("../authorizer/index.js")).handler;
});

beforeEach(() => {
  ddbMock.reset();
  mockGetAuthToken.mockReset();
  mockVerifyCognitoToken.mockReset();
  mockWriteAuditLog.mockClear();
});

const baseEvent = (token, sourceIp = "203.0.113.10") => ({
  headers: { authorization: `Bearer ${token}` },
  requestContext: { http: { sourceIp } },
});

function tokenItem(overrides = {}) {
  return {
    token_id: { S: "tok-1" },
    owner_id: { S: "owner-1" },
    status: { S: "active" },
    scopes: { SS: ["secrets:read"] },
    allowed_secret_paths: { SS: ["NONE"] },
    allowed_ip_cidrs: { SS: ["NONE"] },
    ...overrides,
  };
}

describe("authorizer - malformed input", () => {
  it("denies when no bearer token is present", async () => {
    mockGetAuthToken.mockImplementation(() => {
      throw new Error("Unauthorized: No token provided");
    });
    const result = await handler({ headers: {}, requestContext: { http: { sourceIp: "1.2.3.4" } } });
    expect(result).toEqual({ isAuthorized: false });
  });
});

describe("authorizer - Cognito branch", () => {
  it("allows a valid Cognito JWT and attaches identity context", async () => {
    mockGetAuthToken.mockReturnValue("header.payload.sig");
    mockVerifyCognitoToken.mockResolvedValue({ sub: "user-1", "cognito:groups": ["group1", "group2"] });

    const result = await handler(baseEvent("header.payload.sig"));

    expect(mockVerifyCognitoToken).toHaveBeenCalledWith("header.payload.sig", {
      audience: "test-client-id",
      issuer: "https://cognito-idp.us-east-1.amazonaws.com/test-pool",
    });
    expect(result.isAuthorized).toBe(true);
    expect(result.context.authType).toBe("cognito");
    expect(result.context.userId).toBe("user-1");
    expect(JSON.parse(result.context.groups)).toEqual(["group1", "group2"]);
  });

  it("denies an invalid/expired Cognito JWT", async () => {
    mockGetAuthToken.mockReturnValue("bad.jwt.token");
    mockVerifyCognitoToken.mockRejectedValue(new Error("jwt expired"));

    const result = await handler(baseEvent("bad.jwt.token"));
    expect(result).toEqual({ isAuthorized: false });
  });

  it("denies a token that verifies but carries no subject", async () => {
    mockGetAuthToken.mockReturnValue("header.payload.sig");
    mockVerifyCognitoToken.mockResolvedValue({});
    const result = await handler(baseEvent("header.payload.sig"));
    expect(result).toEqual({ isAuthorized: false });
  });
});

describe("authorizer - machine token branch", () => {
  beforeEach(() => {
    mockGetAuthToken.mockImplementation((event) => event.headers.authorization.replace("Bearer ", ""));
  });

  it("allows an active, unrestricted machine token", async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [tokenItem()] });
    ddbMock.on(UpdateItemCommand).resolves({});

    const result = await handler(baseEvent("rv_live_abc"));

    expect(result.isAuthorized).toBe(true);
    expect(result.context.authType).toBe("machine");
    expect(result.context.userId).toBe("owner-1");
    expect(result.context.tokenId).toBe("tok-1");
    expect(JSON.parse(result.context.scopes)).toEqual(["secrets:read"]);
  });

  it("denies an unknown token", async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [] });
    const result = await handler(baseEvent("rv_live_unknown"));
    expect(result).toEqual({ isAuthorized: false });
    expect(mockWriteAuditLog).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });

  it("denies a revoked token", async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [tokenItem({ status: { S: "revoked" } })] });
    const result = await handler(baseEvent("rv_live_revoked"));
    expect(result).toEqual({ isAuthorized: false });
  });

  it("denies an expired token even if DynamoDB TTL hasn't swept it yet", async () => {
    const pastDate = new Date(Date.now() - 60_000).toISOString();
    ddbMock.on(QueryCommand).resolves({ Items: [tokenItem({ expires_at: { S: pastDate } })] });
    const result = await handler(baseEvent("rv_live_expired"));
    expect(result).toEqual({ isAuthorized: false });
  });

  it("allows a not-yet-expired token", async () => {
    const futureDate = new Date(Date.now() + 60_000).toISOString();
    ddbMock.on(QueryCommand).resolves({ Items: [tokenItem({ expires_at: { S: futureDate } })] });
    ddbMock.on(UpdateItemCommand).resolves({});
    const result = await handler(baseEvent("rv_live_valid"));
    expect(result.isAuthorized).toBe(true);
  });

  it("denies a request from an IP outside the token's allow-list", async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [tokenItem({ allowed_ip_cidrs: { SS: ["203.0.113.0/24"] } })],
    });
    const result = await handler(baseEvent("rv_live_restricted", "198.51.100.5"));
    expect(result).toEqual({ isAuthorized: false });
  });

  it("allows a request from an IP inside the token's allow-list", async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [tokenItem({ allowed_ip_cidrs: { SS: ["203.0.113.0/24"] } })],
    });
    ddbMock.on(UpdateItemCommand).resolves({});
    const result = await handler(baseEvent("rv_live_restricted", "203.0.113.42"));
    expect(result.isAuthorized).toBe(true);
  });

  it("never trusts a client-supplied IP over the API Gateway sourceIp", async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [tokenItem({ allowed_ip_cidrs: { SS: ["203.0.113.0/24"] } })],
    });
    const event = {
      headers: {
        authorization: "Bearer rv_live_restricted",
        "x-forwarded-for": "203.0.113.42", // attacker-supplied, must be ignored
      },
      requestContext: { http: { sourceIp: "198.51.100.5" } }, // real, untrusted source
    };
    const result = await handler(event);
    expect(result).toEqual({ isAuthorized: false });
  });

  it("fails closed if the DynamoDB lookup errors", async () => {
    ddbMock.on(QueryCommand).rejects(new Error("table unavailable"));
    const result = await handler(baseEvent("rv_live_x"));
    expect(result).toEqual({ isAuthorized: false });
  });
});
