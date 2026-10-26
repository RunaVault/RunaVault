import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { formatResponse, parseBody } from "/opt/utils.js";
import {
  getAuthContext,
  generateMachineToken,
  normalizeIpToCidr,
  parseDurationToSeconds,
  writeAuditLog,
  ALLOWED_SCOPES,
} from "/opt/authz.js";

const dynamoDB = new DynamoDBClient({});
const TABLE_PREFIX = process.env.TABLE_PREFIX || "RunaVault_";
const TOKENS_TABLE = process.env.MACHINE_TOKENS_TABLE || `${TABLE_PREFIX}machine_tokens`;

const NONE = "NONE";
const MAX_NAME_LENGTH = 100;
const NAME_PATTERN = /^[A-Za-z0-9 _.\-]{1,100}$/;
const SECRET_PATH_PATTERN = /^[A-Za-z0-9 _.\-/*]{1,200}$/;

export const handler = async (event) => {
  const sourceIp = event.requestContext?.http?.sourceIp;
  try {
    const ctx = getAuthContext(event);
    if (ctx.authType !== "cognito") {
      return formatResponse(403, { message: "Forbidden" });
    }

    const body = parseBody(event.body || "{}");
    const { name, scopes, expiresIn, secretPaths, ipAddresses } = body;

    if (typeof name !== "string" || !NAME_PATTERN.test(name)) {
      return formatResponse(400, {
        message: `Invalid name: must be 1-${MAX_NAME_LENGTH} characters (letters, numbers, spaces, . _ -)`,
      });
    }

    const requestedScopes = Array.isArray(scopes) && scopes.length > 0 ? scopes : ALLOWED_SCOPES;
    const invalidScope = requestedScopes.find((s) => !ALLOWED_SCOPES.includes(s));
    if (invalidScope) {
      return formatResponse(400, { message: `Unsupported scope: ${invalidScope}` });
    }

    let expiresInSeconds;
    try {
      expiresInSeconds = parseDurationToSeconds(expiresIn);
    } catch {
      return formatResponse(400, { message: "Invalid expiresIn format (expected e.g. 30d, 12h, 3600)" });
    }

    const paths = Array.isArray(secretPaths) ? secretPaths : [];
    const invalidPath = paths.find((p) => typeof p !== "string" || !SECRET_PATH_PATTERN.test(p));
    if (invalidPath !== undefined) {
      return formatResponse(400, { message: `Invalid secret path pattern: ${invalidPath}` });
    }

    const ips = Array.isArray(ipAddresses) ? ipAddresses : [];
    let normalizedIps;
    try {
      normalizedIps = ips.map(normalizeIpToCidr);
    } catch {
      return formatResponse(400, { message: "Invalid IP address or CIDR range" });
    }

    const { token, tokenId, tokenHash } = generateMachineToken();
    const now = new Date();
    const createdAt = now.toISOString();
    const expiresAt = expiresInSeconds != null ? new Date(now.getTime() + expiresInSeconds * 1000).toISOString() : null;

    const item = {
      owner_id: { S: ctx.userId },
      token_id: { S: tokenId },
      token_hash: { S: tokenHash },
      name: { S: name },
      status: { S: "active" },
      created_at: { S: createdAt },
      last_used_at: { S: "" },
      scopes: { SS: requestedScopes },
      allowed_secret_paths: { SS: paths.length ? paths : [NONE] },
      allowed_ip_cidrs: { SS: normalizedIps.length ? normalizedIps : [NONE] },
    };
    if (expiresAt) {
      item.expires_at = { S: expiresAt };
      item.expires_in_seconds = { N: String(expiresInSeconds) };
      // Grace period past expiry before DynamoDB TTL cleans up the item -
      // authorization always re-checks expires_at itself, TTL is cleanup only.
      item.ttl = { N: String(Math.floor(new Date(expiresAt).getTime() / 1000) + 60 * 60 * 24 * 30) };
    }

    await dynamoDB.send(
      new PutItemCommand({
        TableName: TOKENS_TABLE,
        Item: item,
        ConditionExpression: "attribute_not_exists(owner_id) AND attribute_not_exists(token_id)",
      })
    );

    await writeAuditLog({
      tokenId,
      ownerId: ctx.userId,
      action: "token.create",
      resource: name,
      sourceIp,
      success: true,
      statusCode: 200,
    });

    return formatResponse(200, {
      tokenId,
      name,
      scopes: requestedScopes,
      secretPaths: paths,
      ipAddresses: normalizedIps,
      expiresAt,
      token,
      warning: "This token will not be shown again. Store it securely.",
    });
  } catch (error) {
    console.error("Error creating machine token:", error.message);
    return formatResponse(500, { message: "Internal Server Error" });
  }
};
