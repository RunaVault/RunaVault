import { CognitoIdentityProviderClient, AdminListGroupsForUserCommand, ListUsersCommand } from "@aws-sdk/client-cognito-identity-provider";
import { verifyToken, formatResponse, parseBody, getAuthToken } from "/opt/utils.js";

const poolData = {
  userPoolId: process.env.USER_POOL_ID,
  region: process.env.AWS_REGION,
};

const cognito = new CognitoIdentityProviderClient({ region: poolData.region });

export const handler = async (event) => {
  try {
    const token = getAuthToken(event);
    await verifyToken(token);

    const { username, listAllUsers } = parseBody(event.body || "{}");

    if (listAllUsers) {
      const params = {
        UserPoolId: poolData.userPoolId,
        Limit: 60,
      };

      let users = [];
      let nextToken = null;

      do {
        if (nextToken) params.NextToken = nextToken;
        const command = new ListUsersCommand(params);
        const response = await cognito.send(command);
        
        const usersWithGroups = await Promise.all(response.Users.map(async (user) => {
          const groupsParams = {
            UserPoolId: poolData.userPoolId,
            Username: user.Username,
            Limit: 60,
          };
          
          let userGroups = [];
          let groupsNextToken = null;
          
          do {
            if (groupsNextToken) groupsParams.NextToken = groupsNextToken;
            const groupsCommand = new AdminListGroupsForUserCommand(groupsParams);
            const groupsResponse = await cognito.send(groupsCommand);
            userGroups = userGroups.concat(groupsResponse.Groups.map(group => ({
              value: group.GroupName,
              label: group.GroupName,
            })));
            groupsNextToken = groupsResponse.NextToken;
          } while (groupsNextToken);
          
          return {
            username: user.Username,
            email: user.Attributes.find(attr => attr.Name === 'email')?.Value,
            enabled: user.Enabled,
            status: user.UserStatus,
            groups: userGroups
          };
        }));
        
        users = users.concat(usersWithGroups);
        nextToken = response.NextToken;
      } while (nextToken);

      return formatResponse(200, { users });
    }

    if (!username) {
      return formatResponse(400, { message: "Username is required when not listing all users" });
    }

    const params = {
      UserPoolId: poolData.userPoolId,
      Username: username,
      Limit: 60,
    };

    let groups = [];
    let nextToken = null;

    do {
      if (nextToken) params.NextToken = nextToken;
      const command = new AdminListGroupsForUserCommand(params);
      const response = await cognito.send(command);
      groups = groups.concat(response.Groups.map(group => ({
        value: group.GroupName,
        label: group.GroupName,
      })));
      nextToken = response.NextToken;
    } while (nextToken);

    return formatResponse(200, { groups });

  } catch (error) {
    const statusCode = error.message.includes("Unauthorized") ? 401 : 500;
    return formatResponse(statusCode, { 
      message: error.message || "Internal Server Error" 
    });
  }
};