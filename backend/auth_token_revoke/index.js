import { DynamoDBClient, GetItemCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { formatResponse } from "/opt/utils.js";
import { getAuthContext, writeAuditLog } from "/opt/authz.js";

const dynamoDB = new DynamoDBClient({});
const TABLE_PREFIX = process.env.TABLE_PREFIX || "RunaVault_";
const TOKENS_TABLE = process.env.MACHINE_TOKENS_TABLE || `${TABLE_PREFIX}machine_tokens`;

export const handler = async (event) => {
  const sourceIp = event.requestContext?.http?.sourceIp;
  try {
    const ctx = getAuthContext(event);
    if (ctx.authType !== "cognito") {
      return formatResponse(403, { message: "Forbidden" });
    }

    const tokenId = event.pathParameters?.tokenId;
    if (!tokenId) {
      return formatResponse(400, { message: "Missing tokenId" });
    }

    const existing = await dynamoDB.send(
      new GetItemCommand({
        TableName: TOKENS_TABLE,
        Key: { owner_id: { S: ctx.userId }, token_id: { S: tokenId } },
      })
    );

    if (!existing.Item) {
      return formatResponse(404, { message: "Token not found" });
    }

    await dynamoDB.send(
      new UpdateItemCommand({
        TableName: TOKENS_TABLE,
        Key: { owner_id: { S: ctx.userId }, token_id: { S: tokenId } },
        UpdateExpression: "SET #status = :revoked",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: { ":revoked": { S: "revoked" } },
      })
    );

    await writeAuditLog({
      tokenId,
      ownerId: ctx.userId,
      action: "token.revoke",
      resource: existing.Item.name?.S,
      sourceIp,
      success: true,
      statusCode: 200,
    });

    return formatResponse(200, { message: "Token revoked", tokenId });
  } catch (error) {
    console.error("Error revoking machine token:", error.message);
    return formatResponse(500, { message: "Internal Server Error" });
  }
};
