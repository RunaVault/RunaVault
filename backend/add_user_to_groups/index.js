import { CognitoIdentityProviderClient, AdminAddUserToGroupCommand } from "@aws-sdk/client-cognito-identity-provider";
import { verifyToken, formatResponse, parseBody, getAuthToken } from "/opt/utils.js";

const { USER_POOL_ID, AWS_REGION } = process.env;
const cognito = new CognitoIdentityProviderClient({ region: AWS_REGION });

export const handler = async (event) => {
  try {
    const token = getAuthToken(event);
    const decodedToken = await verifyToken(token);
    const currentUser = decodedToken.sub;

    const userGroups = decodedToken["cognito:groups"] || [];
    if (!userGroups.includes("Admin")) {
      return formatResponse(403, { message: "Forbidden: Only Admin users can perform this action" });
    }

    const { username, groups } = parseBody(event.body);
    if (!username || !Array.isArray(groups) || groups.length === 0) {
      throw new Error("Username and at least one group are required");
    }

    await Promise.all(
      groups.map((groupName) =>
        cognito.send(
          new AdminAddUserToGroupCommand({
            UserPoolId: USER_POOL_ID,
            Username: username,
            GroupName: groupName,
          })
        )
      )
    );

    const requiresSessionUpdate = username === currentUser || 
                                username === decodedToken.email || 
                                username === decodedToken.username;

    return formatResponse(200, { 
      message: "User added to groups successfully", 
      requiresSessionUpdate 
    });
  } catch (error) {
    console.error("Error:", error.message);
    const statusCode = error.message.includes("Unauthorized") ? 401 : 400;
    return formatResponse(statusCode, { message: error.message });
  }
};