import { CognitoIdentityProviderClient, AdminRemoveUserFromGroupCommand } from "@aws-sdk/client-cognito-identity-provider";
import { verifyToken, formatResponse, parseBody, getAuthToken } from "/opt/utils.js";

const poolData = {
  userPoolId: process.env.USER_POOL_ID,
  region: process.env.AWS_REGION,
};

const cognito = new CognitoIdentityProviderClient({ region: poolData.region });

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
    if (!username || !groups || !Array.isArray(groups) || groups.length === 0) {
      return formatResponse(400, { message: "Username and at least one group are required" });
    }

    for (const groupName of groups) {
      const command = new AdminRemoveUserFromGroupCommand({
        UserPoolId: poolData.userPoolId,
        Username: username,
        GroupName: groupName,
      });
      await cognito.send(command);
    }

    const requiresSessionUpdate = username === currentUser || 
                                username === decodedToken.email || 
                                username === decodedToken.username;

    return formatResponse(200, { 
      message: "User removed from groups successfully",
      requiresSessionUpdate
    });

  } catch (error) {
    const statusCode = error.message.includes("Unauthorized") ? 401 : 500;
    return formatResponse(statusCode, { 
      message: error.message || "Internal Server Error" 
    });
  }
};