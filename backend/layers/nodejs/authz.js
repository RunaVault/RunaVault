import crypto from "crypto";
import ipaddr from "ipaddr.js";
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";

const dynamoDB = new DynamoDBClient({});
const TABLE_PREFIX = process.env.TABLE_PREFIX || "RunaVault_";
const AUDIT_TABLE_NAME = process.env.AUDIT_TABLE_NAME || `${TABLE_PREFIX}audit_log`;

export const MACHINE_TOKEN_PREFIX = "rv_live_";

// The only scope MVP grants. Kept as a list (not a boolean) so additional
// scopes (secrets:write, secrets:delete, ...) can be added later without
// changing the token model or the authorizer.
export const ALLOWED_SCOPES = ["secrets:read"];

export function parseDurationToSeconds(input) {
  if (input === undefined || input === null || input === "") return null;
  if (typeof input === "number") return Math.max(0, Math.floor(input));
  const match = /^(\d+)(s|m|h|d)?$/.exec(String(input).trim());
  if (!match) throw new Error("Invalid duration format");
  const value = parseInt(match[1], 10);
  const unit = match[2] || "s";
  const multipliers = { s: 1, m: 60, h: 3600, d: 86400 };
  return value * multipliers[unit];
}

export function isMachineToken(token) {
  return typeof token === "string" && token.startsWith(MACHINE_TOKEN_PREFIX);
}

// SHA-256 of the raw token. Only this hash is ever persisted - the plaintext
// token is shown to the caller exactly once, at creation time.
export function hashToken(token) {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

export function generateMachineToken() {
  const tokenId = crypto.randomUUID();
  const secret = crypto.randomBytes(32).toString("base64url");
  const token = `${MACHINE_TOKEN_PREFIX}${secret}`;
  return { token, tokenId, tokenHash: hashToken(token) };
}

function safeJsonParse(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

// Reads the identity/authorization context attached by the dual-mode Lambda
// authorizer (backend/authorizer/index.js). This is the single place handlers
// should go to find out who is calling and what they're allowed to do -
// per-handler re-implementation of these checks is what we're avoiding.
export function getAuthContext(event) {
  const authorizerCtx = event.requestContext?.authorizer?.lambda || {};
  const authType = authorizerCtx.authType === "machine" ? "machine" : "cognito";
  return {
    authType,
    userId: authorizerCtx.userId || null,
    groups: safeJsonParse(authorizerCtx.groups, []),
    scopes: safeJsonParse(authorizerCtx.scopes, []),
    allowedSecretPaths: safeJsonParse(authorizerCtx.allowedSecretPaths, []),
    tokenId: authorizerCtx.tokenId || null,
  };
}

export function requireScope(ctx, scope) {
  if (ctx.authType === "cognito") return true;
  return Array.isArray(ctx.scopes) && ctx.scopes.includes(scope);
}

function globToRegExp(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}

// path = "<subdirectory>/<site>", or bare "<site>" when there's no subdirectory.
export function isSecretPathAllowed(ctx, path) {
  if (ctx.authType === "cognito") return true;
  if (!Array.isArray(ctx.allowedSecretPaths) || ctx.allowedSecretPaths.length === 0) return true;
  return ctx.allowedSecretPaths.some((pattern) => globToRegExp(pattern).test(path));
}

export function toSecretPath(site, subdirectory) {
  const effectiveSubdirectory = subdirectory && subdirectory !== "default" ? subdirectory : "";
  return effectiveSubdirectory ? `${effectiveSubdirectory}/${site}` : site;
}

// allowedCidrs entries are always stored as CIDRs (bare IPs normalized to
// /32 or /128 at token-creation time). sourceIp must come from the trusted
// API Gateway request context (event.requestContext.http.sourceIp), never
// from a client-supplied header such as X-Forwarded-For.
export function isIpAllowed(allowedCidrs, sourceIp) {
  if (!Array.isArray(allowedCidrs) || allowedCidrs.length === 0) return true;
  if (!sourceIp) return false;
  let addr;
  try {
    addr = ipaddr.process(sourceIp);
  } catch {
    return false;
  }
  return allowedCidrs.some((cidr) => {
    try {
      const range = ipaddr.parseCIDR(cidr);
      if (range[0].kind() !== addr.kind()) return false;
      return addr.match(range);
    } catch {
      return false;
    }
  });
}

export function normalizeIpToCidr(ip) {
  if (ip.includes("/")) return ip;
  const parsed = ipaddr.process(ip);
  return `${ip}/${parsed.kind() === "ipv6" ? 128 : 32}`;
}

// Fire-and-forget audit trail. Never pass token/secret plaintext in here.
export async function writeAuditLog({ tokenId, ownerId, action, resource, sourceIp, success, statusCode }) {
  try {
    const now = new Date();
    const eventId = `${now.toISOString()}#${crypto.randomUUID()}`;
    const retentionSeconds = 60 * 60 * 24 * 180; // 180 days
    await dynamoDB.send(
      new PutItemCommand({
        TableName: AUDIT_TABLE_NAME,
        Item: {
          subject_id: { S: tokenId || ownerId || "unknown" },
          event_id: { S: eventId },
          token_id: { S: tokenId || "" },
          owner_id: { S: ownerId || "" },
          action: { S: action || "" },
          resource: { S: resource || "" },
          source_ip: { S: sourceIp || "" },
          success: { BOOL: !!success },
          status_code: { N: String(statusCode || 0) },
          ttl: { N: String(Math.floor(now.getTime() / 1000) + retentionSeconds) },
        },
      })
    );
  } catch (err) {
    console.error("Failed to write audit log:", err.message);
  }
}
