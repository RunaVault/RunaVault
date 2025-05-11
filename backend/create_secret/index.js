import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import { verifyToken, formatResponse, parseBody, getAuthToken } from "/opt/utils.js";
import { v4 as uuidv4 } from 'uuid';

const dynamoDB = new DynamoDBClient({});
const TABLE_PREFIX = process.env.TABLE_PREFIX || "RunaVault_";

export const handler = async (event) => {
  try {
    const token = getAuthToken(event);
    const decoded = await verifyToken(token);
    const userId = decoded.sub;
    const body = parseBody(event.body || "{}");
    const {
      site,
      username,
      password: rawPassword,
      encrypted = true,
      sharedWith = { users: [], groups: [], roles: {} },
      subdirectory = "",
      notes = "",
      tags = [],
      favorite = false,
      version = 1,
    } = body;
    if (!site || !username || !rawPassword) {
      return formatResponse(400, {
        message: "Missing required parameters: site, username, and password are required",
      });
    }
    const MAX_NOTES_LENGTH = 500;
    if (notes && notes.length > MAX_NOTES_LENGTH) {
      return formatResponse(400, {
        message: `Notes cannot exceed ${MAX_NOTES_LENGTH} characters`
      });
    }
    let passwordData;
    try {
      passwordData = typeof rawPassword === "string" && rawPassword.startsWith("{")
        ? JSON.parse(rawPassword)
        : { encryptedPassword: rawPassword, sharedWith: { users: [], groups: [] } };
    } catch (e) {
      console.error("Failed to parse password:", e);
      return formatResponse(400, { message: "Invalid password format" });
    }

    const { encryptedPassword } = passwordData;

    const lastModified = new Date().toISOString();
    const passwordId = uuidv4();
    const sortKeyPrefix = subdirectory ? `${site}#${subdirectory}` : site;
    const baseCompositeKey = `${sortKeyPrefix}#${passwordId}`;

    const baseDynamoItem = {
      user_id: { S: userId },
      username: { S: username },
      password: { S: encrypted ? rawPassword : rawPassword },
      encrypted: { BOOL: encrypted },
      shared_with_roles: {
        M: Object.fromEntries(
          Object.entries(sharedWith.roles).map(([k, v]) => [k, { S: v }])
        ),
      },
      subdirectory: { S: subdirectory || "default" },
      last_modified: { S: lastModified },
      notes: { S: notes },
      tags: { SS: tags.length ? tags : ["NONE"] },
      favorite: { BOOL: favorite },
      version: { N: version.toString() },
      password_id: { S: passwordId },
    };

    const groups = Array.isArray(sharedWith.groups) && sharedWith.groups.length > 0
      ? sharedWith.groups
      : ["NONE"];
    const users = Array.isArray(sharedWith.users) && sharedWith.users.length > 0
      ? sharedWith.users
      : ["NONE"];
    const putPromises = [];

    groups.forEach((group) => {
      const compositeKey = `${baseCompositeKey}#group:${group}`;
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
            throw new Error(`An item with user_id ${userId} and site ${compositeKey} already exists for group ${group}`);
          }
          throw conditionError;
        })
      );
    });

    users.forEach((sharedUser) => {
      const compositeKey = `${baseCompositeKey}#user:${sharedUser}`;
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
            throw new Error(`An item with user_id ${userId} and site ${compositeKey} already exists for user ${sharedUser}`);
          }
          throw conditionError;
        })
      );
    });

    await Promise.all(putPromises);

    const firstKey = groups[0] !== "NONE"
      ? `${baseCompositeKey}#group:${groups[0]}`
      : `${baseCompositeKey}#user:${users[0]}`;
    const dynamoResponse = await dynamoDB.send(
      new GetItemCommand({
        TableName: `${TABLE_PREFIX}passwords`,
        Key: { user_id: { S: userId }, site: { S: firstKey } },
      })
    );

    if (!dynamoResponse.Item) {
      return formatResponse(404, { message: "Password not found after creation" });
    }

    const item = dynamoResponse.Item;
    return formatResponse(200, {
      site: item.site.S,
      username: item.username.S,
      password: item.password.S,
      encrypted: item.encrypted.BOOL,
      sharedWith: {
        users: users[0] === "NONE" ? [] : users,
        groups: groups[0] === "NONE" ? [] : groups, 
        roles: Object.fromEntries(
          Object.entries(item.shared_with_roles.M || {}).map(([k, v]) => [k, v.S])
        ),
      },
      subdirectory: item.subdirectory.S,
      notes: item.notes.S,
      tags: item.tags.SS[0] === "NONE" ? [] : item.tags.SS,
      favorite: item.favorite.BOOL,
      version: parseInt(item.version.N, 10),
      last_modified: item.last_modified.S,
      password_id: item.password_id.S,
    });
  } catch (error) {
    console.error("Error:", error);
    const statusCode = error.message.includes("Unauthorized")
      ? 401
      : error.message.includes("not found")
        ? 404
        : 500;
    return formatResponse(statusCode, { message: error.message || "Internal Server Error" });
  }
};