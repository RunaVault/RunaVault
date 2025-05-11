import { DynamoDBClient, DeleteItemCommand, QueryCommand } from "@aws-sdk/client-dynamodb";
import { verifyToken, formatResponse, parseBody, getAuthToken } from "/opt/utils.js";

const dynamoDB = new DynamoDBClient({});
const TABLE_PREFIX = process.env.TABLE_PREFIX || "RunaVault_";

export const handler = async (event) => {
  try {
    const token = getAuthToken(event);
    const decoded = await verifyToken(token);
    const userId = decoded.sub;

    const body = parseBody(event.body);
    if (!body.site) {
      return formatResponse(400, { message: "Missing site parameter" });
    }

    const { site, user_id = userId, subdirectory = "" } = body;

    if (user_id !== userId) {
      return formatResponse(403, { message: "You can only delete your own secrets" });
    }

    const queryResponse = await dynamoDB.send(new QueryCommand({
      TableName: `${TABLE_PREFIX}passwords`,
      KeyConditionExpression: "user_id = :user_id AND begins_with(site, :site_prefix)",
      ExpressionAttributeValues: {
        ":user_id": { S: userId },
        ":site_prefix": { S: site }
      }
    }));

    if (!queryResponse.Items || queryResponse.Items.length === 0) {
      return formatResponse(404, { message: "Password not found" });
    }

    const matchingItems = queryResponse.Items.filter(item => {
      const itemSubdirectory = item.subdirectory?.S || "";
      return itemSubdirectory === subdirectory;
    });

    if (matchingItems.length === 0) {
      return formatResponse(404, { message: "Password not found" });
    }

    const deletePromises = matchingItems.map(item => {
      console.log("Deleting item with site key:", item.site.S);
      return dynamoDB.send(new DeleteItemCommand({
        TableName: `${TABLE_PREFIX}passwords`,
        Key: {
          user_id: { S: userId },
          site: { S: item.site.S }
        }
      }));
    });

    await Promise.all(deletePromises);

    return formatResponse(200, { 
      message: "Password deleted successfully",
      count: matchingItems.length
    });

  } catch (error) {
    console.error("Error deleting password:", error);
    const statusCode = error.message.includes("Unauthorized") ? 401 : 
                      error.message.includes("not found") ? 404 : 500;
    return formatResponse(statusCode, { 
      message: error.message || "Internal Server Error" 
    });
  }
};