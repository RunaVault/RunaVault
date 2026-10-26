import { DynamoDBClient, QueryCommand } from "@aws-sdk/client-dynamodb";
import { formatResponse } from "/opt/utils.js";
import { getAuthContext } from "/opt/authz.js";

const dynamoDB = new DynamoDBClient({});
const TABLE_PREFIX = process.env.TABLE_PREFIX || "RunaVault_";
const TOKENS_TABLE = process.env.MACHINE_TOKENS_TABLE || `${TABLE_PREFIX}machine_tokens`;

const NONE = "NONE";
const stripNone = (set) => (set || []).filter((v) => v !== NONE);

function formatToken(item) {
  return {
    tokenId: item.token_id.S,
    name: item.name.S,
    status: item.status.S,
    createdAt: item.created_at?.S || null,
    expiresAt: item.expires_at?.S || null,
    lastUsedAt: item.last_used_at?.S || null,
    scopes: stripNone(item.scopes?.SS),
    secretPaths: stripNone(item.allowed_secret_paths?.SS),
    ipAddresses: stripNone(item.allowed_ip_cidrs?.SS),
  };
}

export const handler = async (event) => {
  try {
    const ctx = getAuthContext(event);
    if (ctx.authType !== "cognito") {
      return formatResponse(403, { message: "Forbidden" });
    }

    const response = await dynamoDB.send(
      new QueryCommand({
        TableName: TOKENS_TABLE,
        KeyConditionExpression: "owner_id = :owner_id",
        ExpressionAttributeValues: { ":owner_id": { S: ctx.userId } },
      })
    );

    const tokens = (response.Items || []).map(formatToken);
    return formatResponse(200, { tokens });
  } catch (error) {
    console.error("Error listing machine tokens:", error.message);
    return formatResponse(500, { message: "Internal Server Error" });
  }
};
