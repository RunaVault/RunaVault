import { CognitoIdentityProviderClient, AdminDeleteUserCommand, AdminUpdateUserAttributesCommand, AdminResetUserPasswordCommand } from "@aws-sdk/client-cognito-identity-provider";
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

    const userGroups = decodedToken["cognito:groups"] || [];
    if (!userGroups.includes("Admin")) {
      return formatResponse(403, { message: "Forbidden: Only Admin users can perform this action" });
    }

    const { username, deleteUser, editUser, newUsername, given_name, family_name, password } = parseBody(event.body);
    if (!username) {
      return formatResponse(400, { message: "Username is required" });
    }

    if (deleteUser) {
      const command = new AdminDeleteUserCommand({
        UserPoolId: poolData.userPoolId,
        Username: username,
      });
      await cognito.send(command);
      return formatResponse(200, { message: "User deleted successfully" });
    }

    if (editUser) {
      const userAttributes = [];
      
      if (newUsername) {
        userAttributes.push({ 
          Name: "email", 
          Value: newUsername 
        });
      }
      
      if (given_name) {
        userAttributes.push({ 
          Name: "given_name", 
          Value: given_name 
        });
      }
      
      if (family_name) {
        userAttributes.push({ 
          Name: "family_name", 
          Value: family_name 
        });
      }
      
      if (userAttributes.length > 0) {
        const updateCommand = new AdminUpdateUserAttributesCommand({
          UserPoolId: poolData.userPoolId,
          Username: username,
          UserAttributes: userAttributes,
        });
        await cognito.send(updateCommand);
      }
      
      if (password) {
        const passwordCommand = new AdminResetUserPasswordCommand({
          UserPoolId: poolData.userPoolId,
          Username: username,
        });
        await cognito.send(passwordCommand);
      }
      
      return formatResponse(200, { message: "User updated successfully" });
    }

    return formatResponse(400, { message: "No valid action specified (delete or edit)" });

  } catch (error) {
    console.error("Error:", error.message);
    const statusCode = error.message.includes("Unauthorized") ? 401 : 500;
    return formatResponse(statusCode, { 
      message: error.message || "Internal Server Error" 
    });
  }
};