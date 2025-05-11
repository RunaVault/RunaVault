import { CognitoIdentityProviderClient, ListUsersCommand } from "@aws-sdk/client-cognito-identity-provider";
import { verifyToken, formatResponse, getAuthToken } from "/opt/utils.js";

const poolData = {
  userPoolId: process.env.USER_POOL_ID,
  region: process.env.AWS_REGION,
};

const cognito = new CognitoIdentityProviderClient({ region: poolData.region });

export const handler = async (event) => {
  try {
    const token = getAuthToken(event);
    const decoded = await verifyToken(token);
    const userId = decoded.sub;

    const params = {
      UserPoolId: poolData.userPoolId,
      AttributesToGet: ["email", "given_name", "family_name"],
      Limit: 60,
    };

    let users = [];
    let paginationToken = null;

    do {
      if (paginationToken) {
        params.PaginationToken = paginationToken;
      }

      const command = new ListUsersCommand(params);
      const response = await cognito.send(command);
      users = users.concat(
        response.Users.map((user) => {
          const email = user.Attributes.find((attr) => attr.Name === "email")?.Value || "No email";
          const given_name = user.Attributes.find((attr) => attr.Name === "given_name")?.Value || "";
          const family_name = user.Attributes.find((attr) => attr.Name === "family_name")?.Value || "";
          
          let label = email;
          if (given_name || family_name) {
            const fullName = `${given_name} ${family_name}`.trim();
            label = `${fullName} (${email})`;
          }
          
          return {
            username: user.Username,
            email,
            given_name,
            family_name
          };
        })
      );

      paginationToken = response.PaginationToken;
    } while (paginationToken);

    return formatResponse(200, {
      users: users
        .map((user) => ({
          value: user.username,
          label: user.email.includes('@') ? 
                 (user.given_name || user.family_name ? 
                  `${user.given_name || ''} ${user.family_name || ''}`.trim() + ` (${user.email})` : 
                  user.email) : 
                 user.email,
          email: user.email,
          given_name: user.given_name,
          family_name: user.family_name
        }))
        .sort((a, b) => {
          if (!a.given_name && !a.family_name && !b.given_name && !b.family_name) {
            return a.email.localeCompare(b.email);
          }
          
          const nameA = `${a.given_name || ''} ${a.family_name || ''}`.trim();
          const nameB = `${b.given_name || ''} ${b.family_name || ''}`.trim();
          
          if (nameA && nameB) {
            return nameA.localeCompare(nameB);
          }
          
          if (nameA) return -1;
          if (nameB) return 1;
          
          return a.email.localeCompare(b.email);
        }),
    });

  } catch (error) {
    const statusCode = error.message.includes("Unauthorized") ? 401 : 500;
    return formatResponse(statusCode, { 
      message: error.message || "Internal Server Error" 
    });
  }
};