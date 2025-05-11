import { CognitoIdentityProviderClient, CreateGroupCommand } from "@aws-sdk/client-cognito-identity-provider";
import { verifyToken, formatResponse, parseBody, getAuthToken } from "/opt/utils.js";

const cognitoClient = new CognitoIdentityProviderClient({});

export const handler = async (event) => {
  try {
    const token = getAuthToken(event);
    const decodedToken = await verifyToken(token);

    const userGroups = decodedToken["cognito:groups"] || [];
    if (!userGroups.includes("Admin")) {
      return formatResponse(403, { message: "Forbidden: Only Admin users can perform this action" });
    }

    const body = parseBody(event.body);
    const { groupName, description, precedence, roleArn } = body;

    if (!groupName) {
      return formatResponse(400, { message: "Missing groupName parameter" });
    }

    await cognitoClient.send(new CreateGroupCommand({
      GroupName: groupName,
      UserPoolId: process.env.USER_POOL_ID,
      Description: description || undefined,
      Precedence: precedence || undefined,
      RoleArn: roleArn || undefined,
    }));

    return formatResponse(200, { message: "Group created successfully" });
  } catch (error) {
    console.error("Error:", error);
    const statusCode = error.message.includes("Unauthorized") ? 401 : 500;
    return formatResponse(statusCode, { message: error.message || "Internal Server Error" });
  }
};
