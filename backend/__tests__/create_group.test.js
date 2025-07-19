// Mock AWS SDK
const mockSend = jest.fn().mockResolvedValue({});

jest.mock('@aws-sdk/client-cognito-identity-provider', () => ({
  __esModule: true,
  CognitoIdentityProviderClient: jest.fn().mockImplementation(() => ({
    send: mockSend
  })),
  CreateGroupCommand: jest.fn().mockImplementation(params => ({ params }))
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
import { CognitoIdentityProviderClient, CreateGroupCommand } from '@aws-sdk/client-cognito-identity-provider';
import * as utils from '/opt/utils.js';

// Set up environment variables
process.env.USER_POOL_ID = 'test-user-pool-id';

beforeAll(async () => {
  // Dynamically import the handler after mocks are set
  handler = (await import('../create_group/index.js')).handler;
});

describe('create_group Lambda', () => {
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
  });

  test('should create group successfully', async () => {
    const event = {
      headers: {
        Authorization: 'Bearer test-token'
      },
      body: JSON.stringify({
        groupName: 'TestGroup',
        description: 'Test group description',
        precedence: 10
      })
    };

    const result = await handler(event);
    
    expect(utils.getAuthToken).toHaveBeenCalledWith(event);
    expect(utils.verifyToken).toHaveBeenCalledWith('test-token');
    expect(mockSend).toHaveBeenCalledTimes(1);
    
    expect(CreateGroupCommand).toHaveBeenCalledWith({
      GroupName: 'TestGroup',
      UserPoolId: 'test-user-pool-id',
      Description: 'Test group description',
      Precedence: 10,
      RoleArn: undefined
    });
    
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({
      message: 'Group created successfully'
    });
  });

  test('should create group with minimal parameters', async () => {
    const event = {
      headers: {
        Authorization: 'Bearer test-token'
      },
      body: JSON.stringify({
        groupName: 'MinimalGroup'
      })
    };

    const result = await handler(event);
    
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(CreateGroupCommand).toHaveBeenCalledWith({
      GroupName: 'MinimalGroup',
      UserPoolId: 'test-user-pool-id',
      Description: undefined,
      Precedence: undefined,
      RoleArn: undefined
    });
    
    expect(result.statusCode).toBe(200);
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
        groupName: 'TestGroup'
      })
    };

    const result = await handler(event);
    
    expect(result.statusCode).toBe(403);
    expect(JSON.parse(result.body)).toEqual({
      message: 'Forbidden: Only Admin users can perform this action'
    });
  });

  test('should return 400 for missing groupName', async () => {
    const event = {
      headers: {
        Authorization: 'Bearer test-token'
      },
      body: JSON.stringify({
        description: 'Missing group name'
      })
    };

    const result = await handler(event);
    
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toContain('Missing groupName parameter');
  });

  test('should return 401 for unauthorized access', async () => {
    // Make verifyToken reject with Unauthorized error
    utils.verifyToken.mockRejectedValueOnce(new Error('Unauthorized'));

    const event = {
      headers: {
        Authorization: 'Bearer invalid-token'
      },
      body: JSON.stringify({
        groupName: 'TestGroup'
      })
    };

    const result = await handler(event);
    
    expect(result.statusCode).toBe(401);
    expect(JSON.parse(result.body).message).toBe('Unauthorized');
  });

  test('should return 500 for other errors', async () => {
    // Make the send method reject with an error
    mockSend.mockRejectedValueOnce(new Error('Service error'));

    const event = {
      headers: {
        Authorization: 'Bearer test-token'
      },
      body: JSON.stringify({
        groupName: 'TestGroup'
      })
    };

    const result = await handler(event);
    
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toBe('Service error');
  });
});
