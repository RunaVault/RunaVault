import { CognitoIdentityProviderClient, ListGroupsCommand } from "@aws-sdk/client-cognito-identity-provider";
import { verifyToken, formatResponse, getAuthToken } from "/opt/utils.js";

const poolData = {
  userPoolId: process.env.USER_POOL_ID,
  region: process.env.AWS_REGION,
};

const cognito = new CognitoIdentityProviderClient({ region: poolData.region });

export const handler = async (event) => {
  try {
    const token = getAuthToken(event);
    await verifyToken(token);

    const params = {
      UserPoolId: poolData.userPoolId,
      Limit: 60,
    };

    let groups = [];
    let nextToken = null;

    do {
      if (nextToken) params.NextToken = nextToken;

      const command = new ListGroupsCommand(params);
      const response = await cognito.send(command);
      groups = groups.concat(response.Groups.map(group => ({ GroupName: group.GroupName })));
      nextToken = response.NextToken;
    } while (nextToken);

    groups.sort((a, b) => a.GroupName.localeCompare(b.GroupName));

    return formatResponse(200, {
      groups: groups.map(group => ({ value: group.GroupName, label: group.GroupName })),
    });

  } catch (error) {
    const statusCode = error.message.includes("Unauthorized") ? 401 : 500;
    return formatResponse(statusCode, { 
      message: error.message || "Internal Server Error" 
    });
  }
};