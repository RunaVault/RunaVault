import { CognitoIdentityProviderClient, AdminCreateUserCommand } from "@aws-sdk/client-cognito-identity-provider";
import { verifyToken, formatResponse, parseBody, getAuthToken } from "/opt/utils.js";

const { USER_POOL_ID, AWS_REGION } = process.env;

const cognito = new CognitoIdentityProviderClient({ region: AWS_REGION });

export const handler = async (event) => {
  try {
    const token = getAuthToken(event);
    const decodedToken = await verifyToken(token);

    const userGroups = decodedToken["cognito:groups"] || [];
    if (!userGroups.includes("Admin")) {
      return formatResponse(403, { message: "Forbidden: Only Admin users can perform this action" });
    }

    const parsedBody = parseBody(event.body);
    const { email, given_name, family_name } = parsedBody;

    if (!email) {
      return formatResponse(400, {
        message: "Invalid request: email is required"
      });
    }

    const userAttributes = [
      { Name: "email", Value: email },
      { Name: "email_verified", Value: "true" } 
    ];

    if (given_name) {
      userAttributes.push({ Name: "given_name", Value: given_name });
    }
    
    if (family_name) {
      userAttributes.push({ Name: "family_name", Value: family_name });
    }

    const command = new AdminCreateUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: email,
      UserAttributes: userAttributes,
    });

    await cognito.send(command);

    return formatResponse(200, {
      message: email + " user created successfully"
    });

  } catch (error) {
    console.error("Error:", error.message);
    const statusCode = error.message.includes("Unauthorized") ? 401 : 400;
    return formatResponse(statusCode, { 
      message: error.message 
    });
  }
};