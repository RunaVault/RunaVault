/**
 * Unit tests for the shared authorization layer (backend/layers/nodejs/authz.js).
 */
console.error = jest.fn();

process.env.TABLE_PREFIX = "Test_";

import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { mockClient } from "aws-sdk-client-mock";
import "aws-sdk-client-mock-jest";

let authz;
const ddbMock = mockClient(DynamoDBClient);

beforeAll(async () => {
  authz = await import("../layers/nodejs/authz.js");
});

beforeEach(() => {
  ddbMock.reset();
});

describe("isMachineToken", () => {
  it("recognizes machine tokens by prefix", () => {
    expect(authz.isMachineToken("rv_live_abc123")).toBe(true);
  });
  it("rejects JWTs and other strings", () => {
    expect(authz.isMachineToken("eyJhbGciOi.eyJzdWIi.sig")).toBe(false);
    expect(authz.isMachineToken(undefined)).toBe(false);
    expect(authz.isMachineToken(123)).toBe(false);
  });
});

describe("hashToken / generateMachineToken", () => {
  it("hashes deterministically and never returns the plaintext", () => {
    const h1 = authz.hashToken("rv_live_same");
    const h2 = authz.hashToken("rv_live_same");
    expect(h1).toBe(h2);
    expect(h1).not.toContain("rv_live_same");
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it("generates unique, prefixed tokens whose hash matches hashToken", () => {
    const a = authz.generateMachineToken();
    const b = authz.generateMachineToken();
    expect(a.token).toMatch(/^rv_live_/);
    expect(a.token).not.toBe(b.token);
    expect(a.tokenId).not.toBe(b.tokenId);
    expect(authz.hashToken(a.token)).toBe(a.tokenHash);
  });
});

describe("getAuthContext", () => {
  it("defaults to cognito with empty arrays when no authorizer context is present", () => {
    const ctx = authz.getAuthContext({});
    expect(ctx).toEqual({
      authType: "cognito",
      userId: null,
      groups: [],
      scopes: [],
      allowedSecretPaths: [],
      tokenId: null,
    });
  });

  it("reads and JSON-decodes a machine authorizer context", () => {
    const event = {
      requestContext: {
        authorizer: {
          lambda: {
            authType: "machine",
            userId: "owner-1",
            groups: "[]",
            scopes: JSON.stringify(["secrets:read"]),
            allowedSecretPaths: JSON.stringify(["production/*"]),
            tokenId: "tok-1",
          },
        },
      },
    };
    expect(authz.getAuthContext(event)).toEqual({
      authType: "machine",
      userId: "owner-1",
      groups: [],
      scopes: ["secrets:read"],
      allowedSecretPaths: ["production/*"],
      tokenId: "tok-1",
    });
  });

  it("falls back to defaults on malformed JSON in the authorizer context", () => {
    const event = {
      requestContext: { authorizer: { lambda: { authType: "machine", scopes: "not-json" } } },
    };
    expect(authz.getAuthContext(event).scopes).toEqual([]);
  });
});

describe("requireScope", () => {
  it("always allows cognito callers regardless of scope", () => {
    expect(authz.requireScope({ authType: "cognito", scopes: [] }, "secrets:read")).toBe(true);
  });
  it("requires the exact scope for machine callers", () => {
    expect(authz.requireScope({ authType: "machine", scopes: ["secrets:read"] }, "secrets:read")).toBe(true);
    expect(authz.requireScope({ authType: "machine", scopes: [] }, "secrets:read")).toBe(false);
    expect(authz.requireScope({ authType: "machine", scopes: ["secrets:write"] }, "secrets:read")).toBe(false);
  });
});

describe("isSecretPathAllowed / toSecretPath", () => {
  it("always allows cognito callers", () => {
    expect(authz.isSecretPathAllowed({ authType: "cognito", allowedSecretPaths: [] }, "anything")).toBe(true);
  });
  it("allows unrestricted machine tokens (empty allow-list)", () => {
    expect(authz.isSecretPathAllowed({ authType: "machine", allowedSecretPaths: [] }, "production/db")).toBe(true);
  });
  it("matches glob patterns for restricted machine tokens", () => {
    const ctx = { authType: "machine", allowedSecretPaths: ["production/*"] };
    expect(authz.isSecretPathAllowed(ctx, "production/database")).toBe(true);
    expect(authz.isSecretPathAllowed(ctx, "development/database")).toBe(false);
  });
  it("does not let a glob pattern match across path segments unexpectedly", () => {
    const ctx = { authType: "machine", allowedSecretPaths: ["prod"] };
    expect(authz.isSecretPathAllowed(ctx, "production")).toBe(false);
  });
  it("builds a path from subdirectory and site", () => {
    expect(authz.toSecretPath("database", "production")).toBe("production/database");
    expect(authz.toSecretPath("database", "default")).toBe("database");
    expect(authz.toSecretPath("database", "")).toBe("database");
  });
});

describe("isIpAllowed / normalizeIpToCidr", () => {
  it("allows any IP when the allow-list is empty", () => {
    expect(authz.isIpAllowed([], "203.0.113.10")).toBe(true);
  });
  it("denies when there is an allow-list but no source IP", () => {
    expect(authz.isIpAllowed(["203.0.113.10/32"], undefined)).toBe(false);
  });
  it("matches an exact IPv4 CIDR (/32)", () => {
    expect(authz.isIpAllowed(["203.0.113.10/32"], "203.0.113.10")).toBe(true);
    expect(authz.isIpAllowed(["203.0.113.10/32"], "203.0.113.11")).toBe(false);
  });
  it("matches an IPv4 range CIDR", () => {
    expect(authz.isIpAllowed(["203.0.113.0/24"], "203.0.113.200")).toBe(true);
    expect(authz.isIpAllowed(["203.0.113.0/24"], "203.0.114.1")).toBe(false);
  });
  it("matches IPv6 CIDRs", () => {
    expect(authz.isIpAllowed(["2001:db8::/32"], "2001:db8::1")).toBe(true);
    expect(authz.isIpAllowed(["2001:db8::/32"], "2001:db9::1")).toBe(false);
  });
  it("never trusts a spoofable/garbage IP string", () => {
    expect(authz.isIpAllowed(["203.0.113.10/32"], "not-an-ip")).toBe(false);
  });
  it("normalizes bare IPs to /32 or /128", () => {
    expect(authz.normalizeIpToCidr("203.0.113.10")).toBe("203.0.113.10/32");
    expect(authz.normalizeIpToCidr("2001:db8::1")).toBe("2001:db8::1/128");
    expect(authz.normalizeIpToCidr("203.0.113.0/24")).toBe("203.0.113.0/24");
  });
});

describe("parseDurationToSeconds", () => {
  it("returns null for no input", () => {
    expect(authz.parseDurationToSeconds(undefined)).toBeNull();
    expect(authz.parseDurationToSeconds("")).toBeNull();
  });
  it("parses day/hour/minute/second suffixes", () => {
    expect(authz.parseDurationToSeconds("30d")).toBe(30 * 86400);
    expect(authz.parseDurationToSeconds("12h")).toBe(12 * 3600);
    expect(authz.parseDurationToSeconds("5m")).toBe(5 * 60);
    expect(authz.parseDurationToSeconds("90")).toBe(90);
  });
  it("rejects invalid formats", () => {
    expect(() => authz.parseDurationToSeconds("banana")).toThrow("Invalid duration format");
  });
});

describe("writeAuditLog", () => {
  it("writes an item without ever including token or secret plaintext, and never throws", async () => {
    ddbMock.on(PutItemCommand).resolves({});
    await authz.writeAuditLog({
      tokenId: "tok-1",
      ownerId: "user-1",
      action: "secret.get",
      resource: "production/database",
      sourceIp: "203.0.113.10",
      success: true,
      statusCode: 200,
    });

    expect(ddbMock).toHaveReceivedCommandTimes(PutItemCommand, 1);
    const call = ddbMock.commandCalls(PutItemCommand)[0].args[0].input;
    const serialized = JSON.stringify(call);
    expect(serialized).not.toContain("rv_live_");
    expect(call.Item.token_id.S).toBe("tok-1");
    expect(call.Item.owner_id.S).toBe("user-1");
    expect(call.Item.resource.S).toBe("production/database");
    expect(call.Item.success.BOOL).toBe(true);
  });

  it("swallows DynamoDB failures instead of throwing", async () => {
    ddbMock.on(PutItemCommand).rejects(new Error("table missing"));
    await expect(
      authz.writeAuditLog({ tokenId: "t", ownerId: "u", action: "a", resource: "r", sourceIp: "1.2.3.4", success: false, statusCode: 500 })
    ).resolves.toBeUndefined();
  });
});
