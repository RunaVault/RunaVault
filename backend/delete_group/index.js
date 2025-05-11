import { CognitoIdentityProviderClient, DeleteGroupCommand } from "@aws-sdk/client-cognito-identity-provider";
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
    const { groupName } = body;

    if (!groupName) {
      return formatResponse(400, { message: "Missing groupName parameter" });
    }

    if (groupName.toLowerCase() === "admin") {
      return formatResponse(400, { 
        message: "Cannot delete the Admin group" 
      });
    }

    await cognitoClient.send(new DeleteGroupCommand({
      GroupName: groupName,
      UserPoolId: process.env.USER_POOL_ID,
    }));

    return formatResponse(200, { message: "Group deleted successfully" });
  } catch (error) {
    console.error("Error:", error);
    
    if (error.name === "ResourceNotFoundException") {
      return formatResponse(404, { 
        message: "Group not found" 
      });
    }
    
    const statusCode = error.message.includes("Unauthorized") ? 401 : 500;
    return formatResponse(statusCode, { 
      message: error.message || "Internal Server Error" 
    });
  }
};