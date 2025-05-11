import { DynamoDBClient, QueryCommand, PutItemCommand, DeleteItemCommand } from "@aws-sdk/client-dynamodb";
import { verifyToken, formatResponse, parseBody, getAuthToken } from "/opt/utils.js";

const dynamoDB = new DynamoDBClient({});
const TABLE_PREFIX = process.env.TABLE_PREFIX || "RunaVault_";

export const handler = async (event) => {
  try {
    const token = getAuthToken(event);
    const decoded = await verifyToken(token);
    const userId = decoded.sub;

    const body = parseBody(event.body);
    if (!body?.subdirectory) {
      return formatResponse(400, { message: "Missing subdirectory parameter" });
    }

    const { subdirectory, sharedWith } = body;
    const effectiveSubdirectory = subdirectory === "default" ? "" : subdirectory;

    if (!sharedWith || typeof sharedWith !== 'object') {
      return formatResponse(400, { message: "Invalid or missing 'sharedWith' parameter" });
    }

    const validatedSharedWith = {
      users: Array.isArray(sharedWith.users) ? sharedWith.users : [],
      groups: Array.isArray(sharedWith.groups) ? sharedWith.groups : [],
      roles: typeof sharedWith.roles === 'object' ? sharedWith.roles : {}
    };

    if (validatedSharedWith.users.length === 0 && validatedSharedWith.groups.length === 0) {
      return formatResponse(400, { message: "At least one user or group must be specified for sharing" });
    }

    console.log('Validated sharedWith:', validatedSharedWith);

    const queryResponse = await dynamoDB.send(new QueryCommand({
      TableName: `${TABLE_PREFIX}passwords`,
      KeyConditionExpression: "user_id = :user_id",
      ExpressionAttributeValues: {
        ":user_id": { S: userId }
      }
    }));

    const items = queryResponse.Items || [];
    const directoryItems = items.filter(item => {
      const itemSubdirectory = item.subdirectory?.S || "default";
      return itemSubdirectory === effectiveSubdirectory;
    });

    if (directoryItems.length === 0) {
      return formatResponse(404, { message: "No secrets found in the specified directory" });
    }

    const updatedSecrets = [];
    const lastModified = new Date().toISOString();

    const groupedByPasswordId = directoryItems.reduce((grouped, item) => {
      const siteValue = item.site?.S || "";
      const parts = siteValue.split('#');
      
      let passwordId = item.password_id?.S || '';
      
      if (!passwordId) {
        if (parts.length >= 3) {
          passwordId = parts[parts.length - 2]; 
        }
      }
      
      if (!passwordId) {
        passwordId = siteValue;
      }
      
      console.log('Extracted passwordId:', passwordId, 'from site:', siteValue);
      
      if (!grouped[passwordId]) {
        grouped[passwordId] = [];
      }
      grouped[passwordId].push(item);
      return grouped;
    }, {});

    for (const [passwordId, items] of Object.entries(groupedByPasswordId)) {
      const baseItem = items[0];
      const site = baseItem.site.S;
      
      console.log('Processing site:', site);
      const siteParts = site.split('#');

      const lastPart = siteParts[siteParts.length - 1];
      let baseCompositeKey;
      
      if (siteParts.length >= 3) {
        baseCompositeKey = siteParts.slice(0, -1).join('#');
      } else {
        baseCompositeKey = siteParts[0] + '#' + passwordId;
      }
      
      console.log('Base composite key:', baseCompositeKey);

      let existingSharedUsers = new Set();
      let existingSharedGroups = new Set();
      
      items.forEach(item => {
        if (item.shared_with_users?.S && item.shared_with_users.S !== "NONE") {
          existingSharedUsers.add(item.shared_with_users.S);
        }
        if (item.shared_with_groups?.S && item.shared_with_groups.S !== "NONE") {
          existingSharedGroups.add(item.shared_with_groups.S);
        }
      });

      const updatedSharedGroups = [...existingSharedGroups, ...(validatedSharedWith.groups || [])];
      const updatedSharedUsers = [...existingSharedUsers, ...(validatedSharedWith.users || [])];
      
      console.log('Existing users:', [...existingSharedUsers]);
      console.log('Updated users:', updatedSharedUsers);
      console.log('Existing groups:', [...existingSharedGroups]);
      console.log('Updated groups:', updatedSharedGroups);
      
      const existingItemIds = new Set(items.map(item => item.site.S));
      
      try {
        const deletePromises = items.map(item => {
          console.log('Deleting item:', item.site.S);
          return dynamoDB.send(
            new DeleteItemCommand({
              TableName: `${TABLE_PREFIX}passwords`,
              Key: {
                user_id: { S: userId },
                site: { S: item.site.S },
              },
            })
          );
        });
        await Promise.all(deletePromises);
      } catch (error) {
        console.warn("Не вдалося видалити існуючі елементи. Це нормально, якщо ваша політика IAM ще не оновлена:", error.message);
      }

      const baseDynamoItem = {
        user_id: { S: userId },
        username: { S: baseItem.username.S },
        password: { S: baseItem.password.S },
        encrypted: { BOOL: baseItem.encrypted?.BOOL ?? true },
        shared_with_roles: {
          M: {
            ...((baseItem.shared_with_roles?.M || {})),
            ...(Object.fromEntries(Object.entries(validatedSharedWith.roles || {}).map(([k, v]) => [k, { S: v }])))
          }
        },
        subdirectory: { S: baseItem.subdirectory?.S || "default" },
        last_modified: { S: lastModified },
        notes: { S: baseItem.notes?.S ?? "" },
        tags: { SS: baseItem.tags?.SS || ["NONE"] },
        favorite: { BOOL: baseItem.favorite?.BOOL ?? false },
        version: { N: (parseInt(baseItem.version?.N || "1") + 1).toString() },
        password_id: { S: passwordId },
      };

      const groups = updatedSharedGroups.length > 0 ? updatedSharedGroups : ["NONE"];
      const users = updatedSharedUsers.length > 0 ? updatedSharedUsers : ["NONE"];
      const putPromises = [];

      groups.forEach((group) => {
        if (group === "NONE" && groups.length > 1) return;
        
        const compositeKey = `${baseCompositeKey}#group:${group}`;
        console.log('Creating group item with key:', compositeKey);
        
        const putCommand = existingItemIds.has(compositeKey) ? 
          new PutItemCommand({
            TableName: `${TABLE_PREFIX}passwords`,
            Item: {
              ...baseDynamoItem,
              site: { S: compositeKey },
              shared_with_groups: { S: group },
              shared_with_users: { S: "NONE" },
            }
          }) :
          new PutItemCommand({
            TableName: `${TABLE_PREFIX}passwords`,
            Item: {
              ...baseDynamoItem,
              site: { S: compositeKey },
              shared_with_groups: { S: group },
              shared_with_users: { S: "NONE" },
            },
            ConditionExpression: "attribute_not_exists(user_id) AND attribute_not_exists(site)"
          });
          
        putPromises.push(
          dynamoDB.send(putCommand)
            .then(() => {
              console.log('Successfully created/updated group item:', compositeKey);
            }).catch(err => {
              if (err.name === "ConditionalCheckFailedException") {
                console.log("Запис уже існує, пропускаємо:", compositeKey);
                return;
              }
              console.error('Error creating group item:', compositeKey, err);
              throw err;
            })
        );
      });

      users.forEach((user) => {
        if (user === "NONE" && users.length > 1) return;
        
        const compositeKey = `${baseCompositeKey}#user:${user}`;
        console.log('Creating user item with key:', compositeKey);
        
        const putCommand = existingItemIds.has(compositeKey) ? 
          new PutItemCommand({
            TableName: `${TABLE_PREFIX}passwords`,
            Item: {
              ...baseDynamoItem,
              site: { S: compositeKey },
              shared_with_groups: { S: "NONE" },
              shared_with_users: { S: user },
            }
          }) :
          new PutItemCommand({
            TableName: `${TABLE_PREFIX}passwords`,
            Item: {
              ...baseDynamoItem,
              site: { S: compositeKey },
              shared_with_groups: { S: "NONE" },
              shared_with_users: { S: user },
            },
            ConditionExpression: "attribute_not_exists(user_id) AND attribute_not_exists(site)"
          });
          
        putPromises.push(
          dynamoDB.send(putCommand)
            .then(() => {
              console.log('Successfully created/updated user item:', compositeKey);
            }).catch(err => {
              if (err.name === "ConditionalCheckFailedException") {
                console.log("Запис уже існує, пропускаємо:", compositeKey);
                return;
              }
              console.error('Error creating user item:', compositeKey, err);
              throw err;
            })
        );
      });

      try {
        await Promise.all(putPromises);
        console.log('All items created successfully for passwordId:', passwordId);
      } catch (error) {
        console.error('Error creating items for passwordId:', passwordId, error);
        throw error;
      }

      updatedSecrets.push({
        site: baseItem.site.S.split('#')[0],
        subdirectory: baseDynamoItem.subdirectory.S,
        favorite: baseDynamoItem.favorite.BOOL,
        username: baseDynamoItem.username.S,
        password: baseDynamoItem.password.S,
        encrypted: baseDynamoItem.encrypted.BOOL,
        sharedWith: {
          users: users[0] === "NONE" ? [] : users,
          groups: groups[0] === "NONE" ? [] : groups,
          roles: Object.fromEntries(Object.entries(baseDynamoItem.shared_with_roles.M).map(([k, v]) => [k, v.S]))
        },
        notes: baseDynamoItem.notes.S,
        tags: baseDynamoItem.tags.SS.filter(tag => tag !== "NONE"),
        last_modified: lastModified,
        version: parseInt(baseDynamoItem.version.N)
      });
    }

    console.log('All directories shared successfully. Updated secrets:', updatedSecrets);

    return formatResponse(200, {
      message: "Directory shared successfully",
      secrets: updatedSecrets
    });

  } catch (error) {
    console.error("Error in share_directory:", error);
    const statusCode = error.message.includes("Unauthorized") ? 401 :
      error.message.includes("not found") ? 404 : 500;
    return formatResponse(statusCode, {
      message: error.message || "Internal Server Error"
    });
  }
};