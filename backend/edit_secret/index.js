import { DynamoDBClient, PutItemCommand, QueryCommand, DeleteItemCommand } from "@aws-sdk/client-dynamodb";
import { verifyToken, formatResponse, parseBody, getAuthToken } from "/opt/utils.js";

const dynamoDB = new DynamoDBClient({});
const TABLE_PREFIX = process.env.TABLE_PREFIX || "RunaVault_";

export const handler = async (event) => {
  try {
    const token = getAuthToken(event);
    const decoded = await verifyToken(token);
    const userId = decoded.sub;

    const body = parseBody(event.body);
    if (!body?.site) {
      return formatResponse(400, { message: "Missing site parameter" });
    }

    const {
      site,
      user_id = userId,
      subdirectory,
      favorite,
      username,
      password,
      encrypted,
      sharedWith,
      notes,
      tags,
    } = body;

    if (!site.includes("#")) {
      return formatResponse(400, {
        message: "Invalid site format: Must include password_id (e.g., 'baseSite#password_id')",
      });
    }

    const MAX_NOTES_LENGTH = 500;
    if (notes && notes.length > MAX_NOTES_LENGTH) {
      return formatResponse(400, {
        message: `Notes cannot exceed ${MAX_NOTES_LENGTH} characters`,
      });
    }

    const effectiveSubdirectory = subdirectory || "default";

    const userGroups = [];
    if (decoded['cognito:groups']) {
      userGroups.push(...decoded['cognito:groups']);
    }

    const queryResponse = await dynamoDB.send(
      new QueryCommand({
        TableName: `${TABLE_PREFIX}passwords`,
        KeyConditionExpression: "user_id = :user_id AND begins_with(site, :site)",
        ExpressionAttributeValues: {
          ":user_id": { S: user_id },
          ":site": { S: site },
        },
      })
    );

    const matchingItems = queryResponse.Items || [];
    if (matchingItems.length === 0) {
      return formatResponse(404, { message: "Password not found" });
    }

    const storedSubdirectory = matchingItems[0].subdirectory?.S || "default";
    const isSubdirectoryChanged = effectiveSubdirectory !== storedSubdirectory;

    const isOwner = user_id === userId;
    let hasEditPermission = isOwner;

    if (!isOwner) {
      const roles = matchingItems[0].shared_with_roles?.M || {};
      
      for (const group of userGroups) {
        if (roles[group]?.S === "editor") {
          hasEditPermission = true;
          break;
        }
      }

      if (!hasEditPermission) {
        return formatResponse(403, { 
          message: "Permission denied: You can only edit your own secrets or those where you're an editor" 
        });
      }
    }

    const existingSharedWith = {
      users: matchingItems
        .filter((item) => item.shared_with_users?.S && item.shared_with_users.S !== "NONE")
        .map((item) => item.shared_with_users.S),
      groups: matchingItems
        .filter((item) => item.shared_with_groups?.S && item.shared_with_groups.S !== "NONE")
        .map((item) => item.shared_with_groups.S),
      roles: matchingItems[0].shared_with_roles?.M
        ? Object.fromEntries(Object.entries(matchingItems[0].shared_with_roles.M).map(([k, v]) => [k, v.S]))
        : {},
    };

    const updatedSharedWith = sharedWith
      ? {
          users: sharedWith.users ?? existingSharedWith.users,
          groups: sharedWith.groups ?? existingSharedWith.groups,
          roles: sharedWith.roles ?? existingSharedWith.roles,
        }
      : existingSharedWith;

    const lastModified = new Date().toISOString();
    const baseDynamoItem = {
      user_id: { S: user_id },
      username: { S: username ?? matchingItems[0].username.S },
      password: { S: password ?? matchingItems[0].password.S },
      encrypted: { BOOL: encrypted ?? matchingItems[0].encrypted?.BOOL ?? true },
      shared_with_roles: {
        M:
          Object.keys(updatedSharedWith.roles).length > 0
            ? Object.fromEntries(Object.entries(updatedSharedWith.roles).map(([k, v]) => [k, { S: v }]))
            : matchingItems[0].shared_with_roles?.M || {},
      },
      subdirectory: { S: effectiveSubdirectory },
      last_modified: { S: lastModified },
      notes: { S: notes ?? matchingItems[0].notes?.S ?? "" },
      tags: { SS: tags?.length ? tags : ["NONE"] },
      favorite: { BOOL: favorite ?? matchingItems[0].favorite?.BOOL ?? false },
      version: {
        N: matchingItems[0].version?.N
          ? String(parseInt(matchingItems[0].version.N, 10) + 1)
          : "1",
      },
      password_id: { S: matchingItems[0].password_id?.S || site.split("#")[2] || "" },
    };

    const deletePromises = matchingItems.map((item) =>
      dynamoDB.send(
        new DeleteItemCommand({
          TableName: `${TABLE_PREFIX}passwords`,
          Key: {
            user_id: { S: user_id },
            site: { S: item.site.S },
          },
        })
      )
    );
    await Promise.all(deletePromises);

    const groups = Array.isArray(updatedSharedWith.groups) && updatedSharedWith.groups.length > 0
      ? updatedSharedWith.groups
      : ["NONE"];
    const users = Array.isArray(updatedSharedWith.users) && updatedSharedWith.users.length > 0
      ? updatedSharedWith.users
      : ["NONE"];
    const putPromises = [];

    groups.forEach((group) => {
      const compositeKey = `${site}#group:${group}`;
      const dynamoItem = {
        ...baseDynamoItem,
        site: { S: compositeKey },
        shared_with_groups: { S: group },
        shared_with_users: { S: "NONE" },
      };
      putPromises.push(
        dynamoDB.send(
          new PutItemCommand({
            TableName: `${TABLE_PREFIX}passwords`,
            Item: dynamoItem,
            ConditionExpression: "attribute_not_exists(user_id) AND attribute_not_exists(site)",
          })
        ).catch((conditionError) => {
          if (conditionError.name === "ConditionalCheckFailedException") {
            throw new Error(`An item with user_id ${user_id} and site ${compositeKey} already exists for group ${group}`);
          }
          throw conditionError;
        })
      );
    });

    users.forEach((sharedUser) => {
      const compositeKey = `${site}#user:${sharedUser}`;
      const dynamoItem = {
        ...baseDynamoItem,
        site: { S: compositeKey },
        shared_with_groups: { S: "NONE" },
        shared_with_users: { S: sharedUser },
      };
      putPromises.push(
        dynamoDB.send(
          new PutItemCommand({
            TableName: `${TABLE_PREFIX}passwords`,
            Item: dynamoItem,
            ConditionExpression: "attribute_not_exists(user_id) AND attribute_not_exists(site)",
          })
        ).catch((conditionError) => {
          if (conditionError.name === "ConditionalCheckFailedException") {
            throw new Error(`An item with user_id ${user_id} and site ${compositeKey} already exists for user ${sharedUser}`);
          }
          throw conditionError;
        })
      );
    });

    await Promise.all(putPromises);

    return formatResponse(200, {
      message: isSubdirectoryChanged 
        ? "Password updated successfully and moved to new subdirectory" 
        : "Password updated successfully",
      secret: {
        site: site,
        subdirectory: baseDynamoItem.subdirectory.S,
        favorite: baseDynamoItem.favorite.BOOL,
        username: baseDynamoItem.username.S,
        password: baseDynamoItem.password.S,
        encrypted: baseDynamoItem.encrypted.BOOL,
        sharedWith: {
          users: users[0] === "NONE" ? [] : users,
          groups: groups[0] === "NONE" ? [] : groups,
          roles: updatedSharedWith.roles,
        },
        notes: baseDynamoItem.notes.S,
        tags: baseDynamoItem.tags.SS.filter((tag) => tag !== "NONE"),
        last_modified: lastModified,
        version: parseInt(baseDynamoItem.version.N, 10),
        password_id: baseDynamoItem.password_id.S,
      },
    });
  } catch (error) {
    console.error("Error updating secret:", error);
    const statusCode = error.message.includes("Unauthorized")
      ? 401
      : error.message.includes("not found")
      ? 404
      : 500;
    return formatResponse(statusCode, {
      message: error.message || "Internal Server Error",
    });
  }
};