// Mock AWS SDK
const mockSend = jest.fn();

// Mock console.error and console.log to suppress messages during tests
const originalConsoleError = console.error;
const originalConsoleLog = console.log;
beforeAll(() => {
  console.error = jest.fn();
  console.log = jest.fn();
});

afterAll(() => {
  console.error = originalConsoleError;
  console.log = originalConsoleLog;
});

jest.mock('@aws-sdk/client-cognito-identity-provider', () => {
  const originalModule = jest.requireActual('@aws-sdk/client-cognito-identity-provider');
  
  return {
    __esModule: true,
    ...originalModule,
    CognitoIdentityProviderClient: jest.fn().mockImplementation(() => ({
      send: mockSend
    })),
    AdminListGroupsForUserCommand: jest.fn().mockImplementation(params => ({
      ...params,
      constructor: { name: 'AdminListGroupsForUserCommand' }
    })),
    ListUsersCommand: jest.fn().mockImplementation(params => ({
      ...params,
      constructor: { name: 'ListUsersCommand' }
    }))
  };
});

// Mock utils module
jest.mock('/opt/utils.js', () => ({
  __esModule: true,
  getAuthToken: jest.fn((event) => event.headers?.Authorization?.replace('Bearer ', '') || ''),
  verifyToken: jest.fn((token) => {
    if (!token) return Promise.reject(new Error('Unauthorized'));
    return Promise.resolve({
      sub: 'user1',
      'cognito:groups': ['group1', 'group2']
    });
  }),
  parseBody: jest.fn((body) => JSON.parse(body || '{}')),
  formatResponse: jest.fn((status, body) => ({ statusCode: status, body: JSON.stringify(body) }))
}), { virtual: true });

// Set environment variables
process.env.USER_POOL_ID = 'test-user-pool-id';
process.env.AWS_REGION = 'us-east-1';

let handler;
import { CognitoIdentityProviderClient, AdminListGroupsForUserCommand, ListUsersCommand } from '@aws-sdk/client-cognito-identity-provider';
import * as utils from '/opt/utils.js';

beforeAll(async () => {
  // Dynamically import the handler after mocks are set
  handler = (await import('../list_user_groups/index.js')).handler;
});

describe('list_user_groups Lambda', () => {
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
  });

  it('should list groups for a specific user', async () => {
    // Mock event
    const event = {
      headers: { Authorization: 'Bearer validToken' },
      body: JSON.stringify({
        username: 'testuser'
      })
    };

    // Mock Cognito response
    mockSend.mockResolvedValueOnce({
      Groups: [
        { GroupName: 'Admins' },
        { GroupName: 'Developers' }
      ],
      NextToken: null
    });

    // Call handler
    const response = await handler(event);

    // Verify response
    expect(response.statusCode).toBe(200);
    const responseBody = JSON.parse(response.body);
    expect(responseBody).toEqual({
      groups: [
        { value: 'Admins', label: 'Admins' },
        { value: 'Developers', label: 'Developers' }
      ]
    });

    // Verify Cognito call
    expect(mockSend).toHaveBeenCalledTimes(1);
    const listGroupsCommand = mockSend.mock.calls[0][0];
    expect(listGroupsCommand.constructor.name).toBe('AdminListGroupsForUserCommand');
    expect(listGroupsCommand.UserPoolId).toBe('test-user-pool-id');
    expect(listGroupsCommand.Username).toBe('testuser');
    expect(listGroupsCommand.Limit).toBe(60);
  });

  it('should handle pagination when listing groups for a user', async () => {
    // Mock event
    const event = {
      headers: { Authorization: 'Bearer validToken' },
      body: JSON.stringify({
        username: 'testuser'
      })
    };

    // Mock Cognito responses with pagination
    mockSend
      .mockResolvedValueOnce({
        Groups: [
          { GroupName: 'Admins' }
        ],
        NextToken: 'page2Token'
      })
      .mockResolvedValueOnce({
        Groups: [
          { GroupName: 'Developers' }
        ],
        NextToken: null
      });

    // Call handler
    const response = await handler(event);

    // Verify response
    expect(response.statusCode).toBe(200);
    const responseBody = JSON.parse(response.body);
    expect(responseBody).toEqual({
      groups: [
        { value: 'Admins', label: 'Admins' },
        { value: 'Developers', label: 'Developers' }
      ]
    });

    // Verify Cognito calls
    expect(mockSend).toHaveBeenCalledTimes(2);
    
    // First call should not have NextToken
    const firstCommand = mockSend.mock.calls[0][0];
    expect(firstCommand.constructor.name).toBe('AdminListGroupsForUserCommand');
    expect(firstCommand.NextToken).toBeUndefined();
    
    // Second call should have NextToken
    const secondCommand = mockSend.mock.calls[1][0];
    expect(secondCommand.constructor.name).toBe('AdminListGroupsForUserCommand');
    expect(secondCommand.NextToken).toBe('page2Token');
  });

  it('should list all users with their groups when listAllUsers is true', async () => {
    // Mock event
    const event = {
      headers: { Authorization: 'Bearer validToken' },
      body: JSON.stringify({
        listAllUsers: true
      })
    };

    // Mock ListUsersCommand response
    mockSend.mockResolvedValueOnce({
      Users: [
        {
          Username: 'user1',
          Attributes: [
            { Name: 'email', Value: 'user1@example.com' }
          ],
          Enabled: true,
          UserStatus: 'CONFIRMED'
        },
        {
          Username: 'user2',
          Attributes: [
            { Name: 'email', Value: 'user2@example.com' }
          ],
          Enabled: true,
          UserStatus: 'CONFIRMED'
        }
      ],
      NextToken: null
    });

    // Mock AdminListGroupsForUserCommand responses for each user
    mockSend
      .mockResolvedValueOnce({
        Groups: [
          { GroupName: 'Admins' }
        ],
        NextToken: null
      })
      .mockResolvedValueOnce({
        Groups: [
          { GroupName: 'Developers' }
        ],
        NextToken: null
      });

    // Call handler
    const response = await handler(event);

    // Verify response
    expect(response.statusCode).toBe(200);
    const responseBody = JSON.parse(response.body);
    expect(responseBody.users).toHaveLength(2);
    
    expect(responseBody.users[0]).toEqual({
      username: 'user1',
      email: 'user1@example.com',
      enabled: true,
      status: 'CONFIRMED',
      groups: [
        { value: 'Admins', label: 'Admins' }
      ]
    });
    
    expect(responseBody.users[1]).toEqual({
      username: 'user2',
      email: 'user2@example.com',
      enabled: true,
      status: 'CONFIRMED',
      groups: [
        { value: 'Developers', label: 'Developers' }
      ]
    });

    // Verify Cognito calls
    expect(mockSend).toHaveBeenCalledTimes(3);
    
    // First call should be ListUsersCommand
    const listUsersCommand = mockSend.mock.calls[0][0];
    expect(listUsersCommand.constructor.name).toBe('ListUsersCommand');
    
    // Second and third calls should be AdminListGroupsForUserCommand for each user
    const user1GroupsCommand = mockSend.mock.calls[1][0];
    expect(user1GroupsCommand.constructor.name).toBe('AdminListGroupsForUserCommand');
    expect(user1GroupsCommand.Username).toBe('user1');
    
    const user2GroupsCommand = mockSend.mock.calls[2][0];
    expect(user2GroupsCommand.constructor.name).toBe('AdminListGroupsForUserCommand');
    expect(user2GroupsCommand.Username).toBe('user2');
  });

  it('should handle pagination when listing all users', async () => {
    // Mock event
    const event = {
      headers: { Authorization: 'Bearer validToken' },
      body: JSON.stringify({
        listAllUsers: true
      })
    };

    // Mock ListUsersCommand response (first page)
    mockSend.mockResolvedValueOnce({
      Users: [
        {
          Username: 'user1',
          Attributes: [
            { Name: 'email', Value: 'user1@example.com' }
          ],
          Enabled: true,
          UserStatus: 'CONFIRMED'
        }
      ],
      NextToken: 'usersPage2Token'
    });

    // Mock AdminListGroupsForUserCommand response for user1
    mockSend.mockResolvedValueOnce({
      Groups: [
        { GroupName: 'Admins' }
      ],
      NextToken: null
    });

    // Mock ListUsersCommand response (second page)
    mockSend.mockResolvedValueOnce({
      Users: [
        {
          Username: 'user2',
          Attributes: [
            { Name: 'email', Value: 'user2@example.com' }
          ],
          Enabled: true,
          UserStatus: 'CONFIRMED'
        }
      ],
      NextToken: null
    });

    // Mock AdminListGroupsForUserCommand response for user2
    mockSend.mockResolvedValueOnce({
      Groups: [
        { GroupName: 'Developers' }
      ],
      NextToken: null
    });

    // Call handler
    const response = await handler(event);

    // Verify response
    expect(response.statusCode).toBe(200);
    const responseBody = JSON.parse(response.body);
    expect(responseBody.users).toHaveLength(2);

    // Verify Cognito calls - should be 4 calls total
    // 2 for ListUsersCommand with pagination and 2 for AdminListGroupsForUserCommand (one per user)
    expect(mockSend).toHaveBeenCalledTimes(4);
    
    // First call should be ListUsersCommand without NextToken
    const listUsersCommand1 = mockSend.mock.calls[0][0];
    expect(listUsersCommand1.constructor.name).toBe('ListUsersCommand');
    expect(listUsersCommand1.NextToken).toBeUndefined();
    
    // Third call should be ListUsersCommand with NextToken
    const listUsersCommand2 = mockSend.mock.calls[2][0];
    expect(listUsersCommand2.constructor.name).toBe('ListUsersCommand');
    expect(listUsersCommand2.NextToken).toBe('usersPage2Token');
  });

  it('should handle pagination when listing groups for a user in listAllUsers mode', async () => {
    // Mock event
    const event = {
      headers: { Authorization: 'Bearer validToken' },
      body: JSON.stringify({
        listAllUsers: true
      })
    };

    // Mock ListUsersCommand response
    mockSend.mockResolvedValueOnce({
      Users: [
        {
          Username: 'user1',
          Attributes: [
            { Name: 'email', Value: 'user1@example.com' }
          ],
          Enabled: true,
          UserStatus: 'CONFIRMED'
        }
      ],
      NextToken: null
    });

    // Mock AdminListGroupsForUserCommand response (first page)
    mockSend.mockResolvedValueOnce({
      Groups: [
        { GroupName: 'Admins' }
      ],
      NextToken: 'groupsPage2Token'
    });
    
    // Mock AdminListGroupsForUserCommand response (second page)
    mockSend.mockResolvedValueOnce({
      Groups: [
        { GroupName: 'Developers' }
      ],
      NextToken: null
    });

    // Call handler
    const response = await handler(event);

    // Verify response
    expect(response.statusCode).toBe(200);
    const responseBody = JSON.parse(response.body);
    expect(responseBody.users).toHaveLength(1);
    expect(responseBody.users[0].groups).toEqual([
      { value: 'Admins', label: 'Admins' },
      { value: 'Developers', label: 'Developers' }
    ]);

    // Verify Cognito calls - should be 3 calls total
    // 1 for ListUsersCommand and 2 for AdminListGroupsForUserCommand with pagination
    expect(mockSend).toHaveBeenCalledTimes(3);
    
    // First call should be ListUsersCommand
    const listUsersCommand = mockSend.mock.calls[0][0];
    expect(listUsersCommand.constructor.name).toBe('ListUsersCommand');
    
    // Second call should be AdminListGroupsForUserCommand without NextToken
    const groupsCommand1 = mockSend.mock.calls[1][0];
    expect(groupsCommand1.constructor.name).toBe('AdminListGroupsForUserCommand');
    expect(groupsCommand1.NextToken).toBeUndefined();
    
    // Third call should be AdminListGroupsForUserCommand with NextToken
    const groupsCommand2 = mockSend.mock.calls[2][0];
    expect(groupsCommand2.constructor.name).toBe('AdminListGroupsForUserCommand');
    expect(groupsCommand2.NextToken).toBe('groupsPage2Token');
  });

  it('should return 400 when username is missing and not listing all users', async () => {
    // Mock event with missing username
    const event = {
      headers: { Authorization: 'Bearer validToken' },
      body: JSON.stringify({
        // No username provided
        listAllUsers: false
      })
    };

    // Call handler
    const response = await handler(event);

    // Verify response
    expect(response.statusCode).toBe(400);
    const responseBody = JSON.parse(response.body);
    expect(responseBody).toEqual({ 
      message: 'Username is required when not listing all users' 
    });

    // Verify no Cognito calls
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('should return 401 for unauthorized access', async () => {
    // Mock event with no token
    const event = {
      headers: {},
      body: JSON.stringify({
        username: 'testuser'
      })
    };

    // Mock verifyToken to reject
    utils.verifyToken.mockRejectedValueOnce(new Error('Unauthorized'));

    // Call handler
    const response = await handler(event);

    // Verify response
    expect(response.statusCode).toBe(401);
    const responseBody = JSON.parse(response.body);
    expect(responseBody).toEqual({ message: 'Unauthorized' });

    // Verify no Cognito calls
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('should return 500 for service errors', async () => {
    // Mock event
    const event = {
      headers: { Authorization: 'Bearer validToken' },
      body: JSON.stringify({
        username: 'testuser'
      })
    };

    // Mock verifyToken to reject with a non-Unauthorized error
    utils.verifyToken.mockRejectedValueOnce(new Error('Cognito service error'));

    // Call handler
    const response = await handler(event);

    // Verify response
    expect(response.statusCode).toBe(500);
    const responseBody = JSON.parse(response.body);
    expect(responseBody).toEqual({ message: 'Cognito service error' });

    // Verify no Cognito calls were made
    expect(mockSend).not.toHaveBeenCalled();
  });
});
