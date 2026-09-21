import { DynamoDBClient, GetItemCommand, QueryCommand } from "@aws-sdk/client-dynamodb";
import { KMSClient, DecryptCommand } from "@aws-sdk/client-kms";
import { formatResponse, parseBody } from "/opt/utils.js";
import {
  getAuthContext,
  requireScope,
  isSecretPathAllowed,
  toSecretPath,
  writeAuditLog,
} from "/opt/authz.js";

const dynamoDB = new DynamoDBClient({});
const kms = new KMSClient({});
const TABLE_PREFIX = process.env.TABLE_PREFIX || "RunaVault_";

// Mirrors frontend/src/CryptoUtils.js decryptPassword(): the stored envelope
// carries one ciphertext per share target, and the caller only ever gets to
// decrypt the variant that matches their own identity/groups.
function selectCiphertextVariant(passwordData, userId, userGroups) {
  const sharedGroups = passwordData.sharedWith?.groups || [];
  const matchingGroup = sharedGroups.find((g) => userGroups.includes(g.groupId));
  if (matchingGroup) {
    return {
      ciphertext: matchingGroup.encryptedPassword,
      encryptionContext: { groupId: matchingGroup.groupId, purpose: "password-manager" },
    };
  }

  const sharedUsers = passwordData.sharedWith?.users || [];
  const matchingUser = sharedUsers.find((u) => u.userId === userId);
  if (matchingUser) {
    return {
      ciphertext: matchingUser.encryptedPassword,
      encryptionContext: { userId, purpose: "password-manager" },
    };
  }

  return { ciphertext: passwordData.encryptedPassword, encryptionContext: { purpose: "password-manager" } };
}

function tryParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export const handler = async (event) => {
  const sourceIp = event.requestContext?.http?.sourceIp;
  let ctx;
  let secretPath = "";

  try {
    // Identity/authorization already established by the dual-mode Lambda
    // authorizer (backend/authorizer/index.js) - no need to re-verify the
    // token here, only to read the context it attached.
    ctx = getAuthContext(event);
    if (!ctx.userId) {
      return formatResponse(403, { message: "Forbidden - Invalid Token" });
    }

    const body = parseBody(event.body);
    if (!body.site) {
      return formatResponse(400, { message: "Missing site parameter" });
    }
    const { site, subdirectory = "", plaintext = false } = body;
    const effectiveSubdirectory = subdirectory === "default" ? "" : subdirectory;
    secretPath = toSecretPath(site, effectiveSubdirectory || "default");

    if (!requireScope(ctx, "secrets:read") || !isSecretPathAllowed(ctx, secretPath)) {
      await writeAuditLog({
        tokenId: ctx.tokenId,
        ownerId: ctx.userId,
        action: "secret.get",
        resource: secretPath,
        sourceIp,
        success: false,
        statusCode: 403,
      });
      return formatResponse(403, { message: "Forbidden" });
    }

    const userId = ctx.userId;
    const userGroups = ctx.groups || [];
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

        const matchingSecret = groupQueryResponse.Items?.find((i) => {
          const storedSite = i.site.S.split("#")[0];
          return storedSite === site;
        });

        if (matchingSecret) {
          item = matchingSecret;
          break;
        }
      }
    }

    if (!item) {
      await writeAuditLog({
        tokenId: ctx.tokenId,
        ownerId: userId,
        action: "secret.get",
        resource: secretPath,
        sourceIp,
        success: false,
        statusCode: 404,
      });
      return formatResponse(404, { message: "Password not found" });
    }

    const username = item.username.S;
    const storedSubdirectory = item.subdirectory?.S || "default";
    const rawPasswordField = item.password?.S;

    if (!rawPasswordField) {
      return formatResponse(500, { message: "Secret data is incomplete in the database" });
    }

    if (!plaintext) {
      // Existing browser contract: return the opaque ciphertext envelope
      // unchanged. The frontend still decrypts client-side via its own
      // Identity Pool KMS credentials - this path is untouched.
      await writeAuditLog({
        tokenId: ctx.tokenId,
        ownerId: userId,
        action: "secret.get",
        resource: secretPath,
        sourceIp,
        success: true,
        statusCode: 200,
      });
      return formatResponse(200, {
        site,
        username,
        subdirectory: storedSubdirectory,
        password: rawPasswordField,
      });
    }

    // plaintext=true (CLI path only - the frontend never sends this):
    // decrypt server-side using the Lambda's own scoped kms:Decrypt grant.
    const passwordData = tryParseJson(rawPasswordField);
    if (!passwordData) {
      return formatResponse(500, { message: "Secret data is incomplete in the database" });
    }

    const { ciphertext, encryptionContext } = selectCiphertextVariant(passwordData, userId, userGroups);
    if (!ciphertext) {
      return formatResponse(500, { message: "Secret data is incomplete in the database" });
    }

    const kmsResponse = await kms.send(
      new DecryptCommand({
        CiphertextBlob: Buffer.from(ciphertext, "base64"),
        EncryptionContext: encryptionContext,
      })
    );

    await writeAuditLog({
      tokenId: ctx.tokenId,
      ownerId: userId,
      action: "secret.get",
      resource: secretPath,
      sourceIp,
      success: true,
      statusCode: 200,
    });

    return formatResponse(200, {
      site,
      username,
      subdirectory: storedSubdirectory,
      secret: Buffer.from(kmsResponse.Plaintext).toString("utf8"),
    });
  } catch (error) {
    console.error("Error:", error.message);
    await writeAuditLog({
      tokenId: ctx?.tokenId,
      ownerId: ctx?.userId,
      action: "secret.get",
      resource: secretPath,
      sourceIp,
      success: false,
      statusCode: 500,
    });
    return formatResponse(500, { message: error.message || "Internal Server Error" });
  }
};
