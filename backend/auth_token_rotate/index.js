import { DynamoDBClient, GetItemCommand, PutItemCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { formatResponse } from "/opt/utils.js";
import { getAuthContext, generateMachineToken, writeAuditLog } from "/opt/authz.js";

const dynamoDB = new DynamoDBClient({});
const TABLE_PREFIX = process.env.TABLE_PREFIX || "RunaVault_";
const TOKENS_TABLE = process.env.MACHINE_TOKENS_TABLE || `${TABLE_PREFIX}machine_tokens`;

const NONE = "NONE";
const stripNone = (set) => (set || []).filter((v) => v !== NONE);

export const handler = async (event) => {
  const sourceIp = event.requestContext?.http?.sourceIp;
  try {
    const ctx = getAuthContext(event);
    if (ctx.authType !== "cognito") {
      return formatResponse(403, { message: "Forbidden" });
    }

    const oldTokenId = event.pathParameters?.tokenId;
    if (!oldTokenId) {
      return formatResponse(400, { message: "Missing tokenId" });
    }

    const existing = await dynamoDB.send(
      new GetItemCommand({
        TableName: TOKENS_TABLE,
        Key: { owner_id: { S: ctx.userId }, token_id: { S: oldTokenId } },
      })
    );

    if (!existing.Item) {
      return formatResponse(404, { message: "Token not found" });
    }
    if (existing.Item.status?.S !== "active") {
      return formatResponse(400, { message: "Only active tokens can be rotated" });
    }

    const old = existing.Item;
    const { token, tokenId: newTokenId, tokenHash } = generateMachineToken();
    const now = new Date();
    const expiresInSeconds = old.expires_in_seconds?.N ? parseInt(old.expires_in_seconds.N, 10) : null;
    const expiresAt = expiresInSeconds != null ? new Date(now.getTime() + expiresInSeconds * 1000).toISOString() : null;

    const newItem = {
      owner_id: { S: ctx.userId },
      token_id: { S: newTokenId },
      token_hash: { S: tokenHash },
      name: { S: old.name.S },
      status: { S: "active" },
      created_at: { S: now.toISOString() },
      last_used_at: { S: "" },
      scopes: { SS: old.scopes?.SS || [NONE] },
      allowed_secret_paths: { SS: old.allowed_secret_paths?.SS || [NONE] },
      allowed_ip_cidrs: { SS: old.allowed_ip_cidrs?.SS || [NONE] },
    };
    if (expiresAt) {
      newItem.expires_at = { S: expiresAt };
      newItem.expires_in_seconds = { N: String(expiresInSeconds) };
      newItem.ttl = { N: String(Math.floor(new Date(expiresAt).getTime() / 1000) + 60 * 60 * 24 * 30) };
    }

    await dynamoDB.send(
      new PutItemCommand({
        TableName: TOKENS_TABLE,
        Item: newItem,
        ConditionExpression: "attribute_not_exists(owner_id) AND attribute_not_exists(token_id)",
      })
    );

    await dynamoDB.send(
      new UpdateItemCommand({
        TableName: TOKENS_TABLE,
        Key: { owner_id: { S: ctx.userId }, token_id: { S: oldTokenId } },
        UpdateExpression: "SET #status = :revoked",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: { ":revoked": { S: "revoked" } },
      })
    );

    await writeAuditLog({
      tokenId: newTokenId,
      ownerId: ctx.userId,
      action: "token.rotate",
      resource: `${old.name.S} (replaces ${oldTokenId})`,
      sourceIp,
      success: true,
      statusCode: 200,
    });

    return formatResponse(200, {
      tokenId: newTokenId,
      name: old.name.S,
      scopes: stripNone(old.scopes?.SS),
      secretPaths: stripNone(old.allowed_secret_paths?.SS),
      ipAddresses: stripNone(old.allowed_ip_cidrs?.SS),
      expiresAt,
      token,
      warning: "This token will not be shown again. Store it securely.",
      revokedTokenId: oldTokenId,
    });
  } catch (error) {
    console.error("Error rotating machine token:", error.message);
    return formatResponse(500, { message: "Internal Server Error" });
  }
};
