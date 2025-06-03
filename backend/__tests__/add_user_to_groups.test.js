// Mock AWS SDK
const mockSend = jest.fn().mockResolvedValue({});

jest.mock('@aws-sdk/client-cognito-identity-provider', () => ({
  __esModule: true,
  CognitoIdentityProviderClient: jest.fn().mockImplementation(() => ({
    send: mockSend
  })),
  AdminAddUserToGroupCommand: jest.fn().mockImplementation(params => ({ params }))
}));

// Mock utils module
jest.mock('/opt/utils.js', () => ({
  __esModule: true,
  getAuthToken: jest.fn((event) => event.headers?.Authorization?.replace('Bearer ', '') || ''),
  verifyToken: jest.fn((token) => token ? {
    sub: 'admin-user-id',
    'cognito:groups': ['Admin'],
    email: 'admin@example.com',
    username: 'admin'
  } : Promise.reject(new Error('Unauthorized'))),
  parseBody: jest.fn((body) => JSON.parse(body)),
  formatResponse: jest.fn((status, body) => ({ statusCode: status, body: JSON.stringify(body) }))
}), { virtual: true });

let handler;
import { CognitoIdentityProviderClient, AdminAddUserToGroupCommand } from '@aws-sdk/client-cognito-identity-provider';
import * as utils from '/opt/utils.js';

// Set up environment variables
process.env.USER_POOL_ID = 'test-user-pool-id';
process.env.AWS_REGION = 'us-east-1';

beforeAll(async () => {
  // Dynamically import the handler after mocks are set
  handler = (await import('../add_user_to_groups/index.js')).handler;
});

describe('add_user_to_groups Lambda', () => {
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
  });

  test('should add user to groups successfully', async () => {
    const event = {
      headers: {
        Authorization: 'Bearer test-token'
      },
      body: JSON.stringify({
        username: 'testuser',
        groups: ['Group1', 'Group2']
      })
    };

    const result = await handler(event);
    
    expect(utils.getAuthToken).toHaveBeenCalledWith(event);
    expect(utils.verifyToken).toHaveBeenCalledWith('test-token');
    expect(mockSend).toHaveBeenCalledTimes(2); // Once for each group
    
    // Verify the first AdminAddUserToGroupCommand call
    expect(AdminAddUserToGroupCommand).toHaveBeenCalledWith({
      UserPoolId: 'test-user-pool-id',
      Username: 'testuser',
      GroupName: 'Group1'
    });
    
    // Verify the second AdminAddUserToGroupCommand call
    expect(AdminAddUserToGroupCommand).toHaveBeenCalledWith({
      UserPoolId: 'test-user-pool-id',
      Username: 'testuser',
      GroupName: 'Group2'
    });
    
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({
      message: 'User added to groups successfully',
      requiresSessionUpdate: false
    });
  });

  test('should return requiresSessionUpdate=true when adding current user to groups', async () => {
    const event = {
      headers: {
        Authorization: 'Bearer test-token'
      },
      body: JSON.stringify({
        username: 'admin-user-id', // Same as the sub in verifyToken mock
        groups: ['Group1']
      })
    };

    const result = await handler(event);
    
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({
      message: 'User added to groups successfully',
      requiresSessionUpdate: true
    });
  });

  test('should return 403 when user is not an Admin', async () => {
    // Override verifyToken mock for this test only
    utils.verifyToken.mockResolvedValueOnce({
      sub: 'regular-user-id',
      'cognito:groups': ['Users'],
      email: 'user@example.com',
      username: 'user'
    });

    const event = {
      headers: {
        Authorization: 'Bearer test-token'
      },
      body: JSON.stringify({
        username: 'testuser',
        groups: ['Group1']
      })
    };

    const result = await handler(event);
    
    expect(result.statusCode).toBe(403);
    expect(JSON.parse(result.body)).toEqual({
      message: 'Forbidden: Only Admin users can perform this action'
    });
  });

  test('should return 400 for missing username', async () => {
    const event = {
      headers: {
        Authorization: 'Bearer test-token'
      },
      body: JSON.stringify({
        groups: ['Group1']
      })
    };

    const result = await handler(event);
    
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toContain('Username and at least one group are required');
  });

  test('should return 400 for missing groups', async () => {
    const event = {
      headers: {
        Authorization: 'Bearer test-token'
      },
      body: JSON.stringify({
        username: 'testuser'
      })
    };

    const result = await handler(event);
    
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toContain('Username and at least one group are required');
  });

  test('should return 400 for empty groups array', async () => {
    const event = {
      headers: {
        Authorization: 'Bearer test-token'
      },
      body: JSON.stringify({
        username: 'testuser',
        groups: []
      })
    };

    const result = await handler(event);
    
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toContain('Username and at least one group are required');
  });
});
