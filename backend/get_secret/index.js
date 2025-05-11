import { DynamoDBClient, GetItemCommand, QueryCommand } from "@aws-sdk/client-dynamodb";
import { verifyToken, formatResponse, parseBody, getAuthToken } from "/opt/utils.js";

const dynamoDB = new DynamoDBClient({});
const TABLE_PREFIX = process.env.TABLE_PREFIX || "RunaVault_";

export const handler = async (event) => {
  try {
    const token = getAuthToken(event);
    await verifyToken(token);

    const userClaims = event.requestContext?.authorizer?.jwt?.claims;
    if (!userClaims || !userClaims.sub) {
      return formatResponse(403, { message: "Forbidden - Invalid Token" });
    }
    const userId = userClaims.sub;

    const body = parseBody(event.body);
    if (!body.site) {
      return formatResponse(400, { message: "Missing site parameter" });
    }
    const { site, subdirectory = "" } = body;

    let userGroups = userClaims["cognito:groups"] || [];
    if (typeof userGroups === "string") {
      try {
        let parsedGroups = userGroups;
        if (!userGroups.startsWith("[")) {
          parsedGroups = userGroups.split(" ").filter(g => g);
        } else {
          parsedGroups = JSON.parse(userGroups.replace(/(\w+)\s+(\w+)/g, '["$1", "$2"]'));
        }
        userGroups = Array.isArray(parsedGroups) ? parsedGroups : [userGroups];
      } catch (e) {
        userGroups = userGroups.includes(" ") ? userGroups.split(" ").filter(g => g) : [userGroups];
      }
    }
    userGroups = [].concat(...userGroups)
      .map(group => (typeof group === "string" ? group.replace(/[\[\]]/g, "").trim() : group))
      .filter(group => group);

    const effectiveSubdirectory = subdirectory === "default" ? "" : subdirectory;
    const compositeKey = `${site}${effectiveSubdirectory ? `#${effectiveSubdirectory}` : ""}`;

    let dynamoResponse = await dynamoDB.send(
      new GetItemCommand({
        TableName: `${TABLE_PREFIX}passwords`,
        Key: {
          user_id: { S: userId },
          site: { S: compositeKey },
        },
      })
    );

    let item = dynamoResponse.Item;
    let ownerId = userId;
    let encryptedPasswordData = item?.password?.S;

    if (!item) {
      const queryResponse = await dynamoDB.send(
        new QueryCommand({
          TableName: `${TABLE_PREFIX}passwords`,
          KeyConditionExpression: "user_id = :user_id AND site = :site",
          ExpressionAttributeValues: {
            ":user_id": { S: userId },
            ":site": { S: compositeKey },
          },
        })
      );

      item = queryResponse.Items?.[0];
      if (item) {
        encryptedPasswordData = item.password.S;
      }
    }

    if (!item && userGroups.length > 0) {
      for (const group of userGroups) {
        const groupQueryResponse = await dynamoDB.send(
          new QueryCommand({
            TableName: `${TABLE_PREFIX}passwords`,
            IndexName: "shared_with_groups-index",
            KeyConditionExpression: "shared_with_groups = :group_id",
            FilterExpression: "subdirectory = :subdirectory",
            ExpressionAttributeValues: {
              ":group_id": { S: group },
              ":subdirectory": { S: effectiveSubdirectory || "default" },
            },
          })
        );

        const matchingSecret = groupQueryResponse.Items?.find(i => {
          const storedSite = i.site.S.split("#")[0];
          return storedSite === site;
        });

        if (matchingSecret) {
          ownerId = matchingSecret.user_id.S;
          item = matchingSecret;
          const parsedPasswordData = JSON.parse(item.password.S);
          const groupEncryptedPassword = parsedPasswordData.sharedWith?.groups?.find(
            g => g.groupId === group
          )?.encryptedPassword;
          encryptedPasswordData = JSON.stringify({
            encryptedPassword: groupEncryptedPassword || parsedPasswordData.encryptedPassword,
            sharedWith: parsedPasswordData.sharedWith,
          });
          break;
        }
      }
    }

    if (!item) {
      return formatResponse(404, { message: "Password not found" });
    }

    const username = item.username.S;
    const storedSubdirectory = item.subdirectory?.S || "default";

    if (!encryptedPasswordData) {
      return formatResponse(500, { message: "Secret data is incomplete in the database" });
    }

    return formatResponse(200, {
      site,
      username,
      subdirectory: storedSubdirectory,
      password: encryptedPasswordData,
    });

  } catch (error) {
    console.error("Error:", error);
    const statusCode = error.message.includes("Unauthorized") ? 401 : 
                      error.message.includes("Forbidden") ? 403 : 500;
    return formatResponse(statusCode, { 
      message: error.message || "Internal Server Error" 
    });
  }
};