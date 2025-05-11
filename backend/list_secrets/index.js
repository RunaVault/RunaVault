import { DynamoDBClient, QueryCommand } from "@aws-sdk/client-dynamodb";
import { verifyToken, formatResponse, getAuthToken } from "/opt/utils.js";

const dynamoDB = new DynamoDBClient({});
const TABLE_PREFIX = process.env.TABLE_PREFIX || "RunaVault_";

function formatSecret(item) {
  let passwordData;
  try {
    passwordData = JSON.parse(item.password.S);
  } catch (e) {
    console.error("Failed to parse password:", e);
    passwordData = { encryptedPassword: item.password.S, sharedWith: { users: [], groups: [] } };
  }

  const siteParts = item.site.S.split(/#group:|#user:/);
  const baseSite = siteParts[0];

  return {
    user_id: item.user_id.S,
    site: baseSite,
    password_id: item.password_id?.S || baseSite.split("#")[2] || "",
    subdirectory: item.subdirectory?.S || "default",
    username: item.username.S,
    password: passwordData,
    encrypted: item.encrypted?.BOOL ?? true,
    shared_with: {
      users: item.shared_with_users?.S && item.shared_with_users.S !== "NONE"
        ? [item.shared_with_users.S]
        : [],
      groups: item.shared_with_groups?.S && item.shared_with_groups.S !== "NONE"
        ? [item.shared_with_groups.S]
        : [],
      roles: item.shared_with_roles?.M
        ? Object.fromEntries(Object.entries(item.shared_with_roles.M).map(([key, value]) => [key, value.S]))
        : {},
    },
    last_modified: item.last_modified?.S || "N/A",
    notes: item.notes?.S || "",
    tags: item.tags?.SS?.[0] === "NONE" ? [] : item.tags?.SS || [],
    favorite: item.favorite?.BOOL || false,
    version: item.version?.N ? parseInt(item.version.N, 10) : 1,
  };
}

export const handler = async (event) => {
  try {
    const token = getAuthToken(event);
    const decoded = await verifyToken(token);

    const userId = decoded.sub;
    const userGroups = decoded["cognito:groups"] || [];

    if (!userId) {
      return formatResponse(400, { message: "Invalid token: Missing userId" });
    }

    console.log(`Fetching secrets for user: ${userId}`);

    const userSecretsResponse = await dynamoDB.send(
      new QueryCommand({
        TableName: `${TABLE_PREFIX}passwords`,
        KeyConditionExpression: "user_id = :user_id",
        ExpressionAttributeValues: {
          ":user_id": { S: userId },
        },
      })
    );
    const userSecrets = (userSecretsResponse.Items || []).map((item) => ({
      ...formatSecret(item),
      owned_by_me: true,
    }));

    console.log(`User owns ${userSecrets.length} secrets`);

    let groupSecrets = [];
    if (userGroups.length > 0) {
      const groupQueryPromises = userGroups.map(async (group) => {
        const response = await dynamoDB.send(
          new QueryCommand({
            TableName: `${TABLE_PREFIX}passwords`,
            IndexName: "shared_with_groups-index",
            KeyConditionExpression: "shared_with_groups = :group_id",
            ExpressionAttributeValues: {
              ":group_id": { S: group },
            },
          })
        );
        return response.Items || [];
      });

      const groupResults = await Promise.all(groupQueryPromises);
      groupSecrets = groupResults
        .flat()
        .map((item) => ({
          ...formatSecret(item),
          owned_by_me: item.user_id.S === userId,
        }))
        .filter((secret) => secret.user_id !== userId);
    }

    console.log(`User has access to ${groupSecrets.length} secrets via groups`);

    const userSharedSecretsResponse = await dynamoDB.send(
      new QueryCommand({
        TableName: `${TABLE_PREFIX}passwords`,
        IndexName: "shared_with_users-index",
        KeyConditionExpression: "shared_with_users = :user_id",
        ExpressionAttributeValues: {
          ":user_id": { S: userId },
        },
      })
    );

    const userSharedSecrets = (userSharedSecretsResponse.Items || []).map((item) => ({
      ...formatSecret(item),
      owned_by_me: item.user_id.S === userId,
    }));

    console.log(`User has ${userSharedSecrets.length} secrets shared directly with them`);

    const allSecrets = [...userSecrets, ...groupSecrets, ...userSharedSecrets];
    const uniqueSecrets = Array.from(
      new Map(
        allSecrets.map((secret) => {
          const key = `${secret.user_id}-${secret.site}-${secret.subdirectory}`;
          return [
            key,
            {
              ...secret,
              shared_with: {
                ...secret.shared_with,
                groups: allSecrets
                  .filter((s) => `${s.user_id}-${s.site}-${s.subdirectory}` === key)
                  .flatMap((s) => s.shared_with.groups),
                users: allSecrets
                  .filter((s) => `${s.user_id}-${s.site}-${s.subdirectory}` === key)
                  .flatMap((s) => s.shared_with.users),
              },
            },
          ];
        })
      ).values()
    );

    console.log(`Returning ${uniqueSecrets.length} unique secrets`);

    uniqueSecrets.sort((a, b) => a.site.toLowerCase().localeCompare(b.site.toLowerCase()));

    return formatResponse(200, { secrets: uniqueSecrets });
  } catch (error) {
    console.error("Error fetching secrets:", error);
    return formatResponse(500, { message: error.message || "Internal Server Error" });
  }
};