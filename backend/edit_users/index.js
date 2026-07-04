import { CognitoIdentityProviderClient, AdminDeleteUserCommand, AdminUpdateUserAttributesCommand, AdminResetUserPasswordCommand, AdminSetUserPasswordCommand, AdminGetUserCommand } from "@aws-sdk/client-cognito-identity-provider";
import { verifyToken, formatResponse, parseBody, getAuthToken } from "/opt/utils.js";

const poolData = {
  userPoolId: process.env.USER_POOL_ID,
  region: process.env.AWS_REGION,
};

const cognito = new CognitoIdentityProviderClient({ region: poolData.region });

// Generates a random temporary password that satisfies Cognito's password policy
// (min 8 chars, uppercase, lowercase, digit, symbol).
function generateTempPassword() {
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lower = "abcdefghijklmnopqrstuvwxyz";
  const digits = "0123456789";
  const symbols = "!@#$%^&*";
  const all = upper + lower + digits + symbols;

  const getRandom = (charset) =>
    charset[Math.floor(Math.random() * charset.length)];

  // Guarantee at least one of each required character class
  const required = [
    getRandom(upper),
    getRandom(lower),
    getRandom(digits),
    getRandom(symbols),
  ];

  // Fill the remaining length with random characters from the full set
  const remaining = Array.from({ length: 8 }, () => getRandom(all));

  // Shuffle so required chars aren't always at the start
  return [...required, ...remaining]
    .sort(() => Math.random() - 0.5)
    .join("");
}

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
        // Users in FORCE_CHANGE_PASSWORD state (never logged in) cannot use
        // AdminResetUserPasswordCommand — it only works for CONFIRMED users.
        // For those users we re-issue a new temporary password instead.
        const getUserCommand = new AdminGetUserCommand({
          UserPoolId: poolData.userPoolId,
          Username: username,
        });
        const userDetails = await cognito.send(getUserCommand);
        const userStatus = userDetails.UserStatus;

        if (userStatus === "FORCE_CHANGE_PASSWORD") {
          // Generate a compliant temporary password and set it as non-permanent
          // so the user is still required to change it on first login.
          const tempPassword = generateTempPassword();
          const setPasswordCommand = new AdminSetUserPasswordCommand({
            UserPoolId: poolData.userPoolId,
            Username: username,
            Password: tempPassword,
            Permanent: false,
          });
          await cognito.send(setPasswordCommand);
        } else {
          // CONFIRMED users: trigger the standard reset flow which sends
          // a verification code to the user's email.
          const passwordCommand = new AdminResetUserPasswordCommand({
            UserPoolId: poolData.userPoolId,
            Username: username,
          });
          await cognito.send(passwordCommand);
        }
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