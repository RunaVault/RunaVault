import { DynamoDBClient, QueryCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { getAuthToken, verifyCognitoToken } from "/opt/utils.js";
import { isMachineToken, hashToken, isIpAllowed, writeAuditLog } from "/opt/authz.js";

const dynamoDB = new DynamoDBClient({});
const TABLE_PREFIX = process.env.TABLE_PREFIX || "RunaVault_";
const TOKENS_TABLE = process.env.MACHINE_TOKENS_TABLE || `${TABLE_PREFIX}machine_tokens`;
const USER_POOL_CLIENT_ID = process.env.USER_POOL_CLIENT_ID;
const COGNITO_ISSUER = process.env.COGNITO_ISSUER;
const NONE = "NONE";

function deny() {
  return { isAuthorized: false };
}

function parseCognitoGroups(raw) {
  let groups = raw || [];
  if (typeof groups === "string") {
    try {
      groups = groups.startsWith("[")
        ? JSON.parse(groups.replace(/(\w+)\s(\w+)/g, '["$1", "$2"]'))
        : groups.split(" ").filter(Boolean);
    } catch {
      groups = groups.split(" ").filter(Boolean);
    }
  }
  return [].concat(groups).filter(Boolean);
}

function stripNone(set) {
  return (set || []).filter((value) => value !== NONE);
}

export const handler = async (event) => {
  const sourceIp = event.requestContext?.http?.sourceIp;
  let token;
  try {
    token = getAuthToken(event);
  } catch {
    return deny();
  }

  return isMachineToken(token)
    ? authorizeMachineToken(token, sourceIp)
    : authorizeCognitoToken(token);
};

async function authorizeCognitoToken(token) {
  try {
    const decoded = await verifyCognitoToken(token, {
      audience: USER_POOL_CLIENT_ID,
      issuer: COGNITO_ISSUER,
    });
    if (!decoded?.sub) return deny();
    return {
      isAuthorized: true,
      context: {
        authType: "cognito",
        userId: decoded.sub,
        groups: JSON.stringify(parseCognitoGroups(decoded["cognito:groups"])),
        scopes: "[]",
        allowedSecretPaths: "[]",
        tokenId: "",
      },
    };
  } catch (err) {
    console.error("Cognito authorization failed:", err.message);
    return deny();
  }
}

async function authorizeMachineToken(token, sourceIp) {
  const tokenHash = hashToken(token);
  let record;
  try {
    const result = await dynamoDB.send(
      new QueryCommand({
        TableName: TOKENS_TABLE,
        IndexName: "token-hash-index",
        KeyConditionExpression: "token_hash = :hash",
        ExpressionAttributeValues: { ":hash": { S: tokenHash } },
        Limit: 1,
      })
    );
    record = result.Items?.[0];
  } catch (err) {
    console.error("Failed to look up machine token:", err.message);
    return deny();
  }

  if (!record) {
    await writeAuditLog({ action: "authorize", success: false, sourceIp });
    return deny();
  }

  const tokenId = record.token_id.S;
  const ownerId = record.owner_id.S;
  const status = record.status?.S;
  const expiresAt = record.expires_at?.S;
  const allowedIpCidrs = stripNone(record.allowed_ip_cidrs?.SS);

  const isExpired = Boolean(expiresAt) && new Date(expiresAt).getTime() < Date.now();
  const ipOk = isIpAllowed(allowedIpCidrs, sourceIp);

  if (status !== "active" || isExpired || !ipOk) {
    await writeAuditLog({ tokenId, ownerId, action: "authorize", success: false, sourceIp });
    return deny();
  }

  // Best-effort bookkeeping - never blocks or fails the authorization decision.
  dynamoDB
    .send(
      new UpdateItemCommand({
        TableName: TOKENS_TABLE,
        Key: { owner_id: { S: ownerId }, token_id: { S: tokenId } },
        UpdateExpression: "SET last_used_at = :now",
        ExpressionAttributeValues: { ":now": { S: new Date().toISOString() } },
      })
    )
    .catch((err) => console.error("Failed to update last_used_at:", err.message));

  return {
    isAuthorized: true,
    context: {
      authType: "machine",
      userId: ownerId,
      groups: "[]",
      scopes: JSON.stringify(stripNone(record.scopes?.SS)),
      allowedSecretPaths: JSON.stringify(stripNone(record.allowed_secret_paths?.SS)),
      tokenId,
    },
  };
}
