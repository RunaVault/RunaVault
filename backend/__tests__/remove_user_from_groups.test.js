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
    AdminRemoveUserFromGroupCommand: jest.fn().mockImplementation(params => ({
      ...params,
      constructor: { name: 'AdminRemoveUserFromGroupCommand' }
    }))
  };
});

// Mock utils module
jest.mock('/opt/utils.js', () => ({
  __esModule: true,
  getAuthToken: jest.fn((event) => event.headers?.Authorization?.replace('Bearer ', '') || ''),
  verifyToken: jest.fn((token) => {
    if (!token || token === 'invalid') return Promise.reject(new Error('Unauthorized'));
    if (token === 'admin') {
      return Promise.resolve({
        sub: 'admin-user',
        'cognito:groups': ['Admin']
      });
    }
    return Promise.resolve({
      sub: 'regular-user',
      'cognito:groups': ['Users']
    });
  }),
  parseBody: jest.fn((body) => JSON.parse(body || '{}')),
  formatResponse: jest.fn((status, body) => ({ statusCode: status, body: JSON.stringify(body) }))
}), { virtual: true });

// Set environment variables
process.env.USER_POOL_ID = 'test-user-pool-id';
process.env.AWS_REGION = 'us-east-1';

// Import the handler after mocking
import { CognitoIdentityProviderClient, AdminRemoveUserFromGroupCommand } from '@aws-sdk/client-cognito-identity-provider';
import * as utils from '/opt/utils.js';

// Import the handler after mocking
let handler;
beforeAll(async () => {
  const module = await import('../remove_user_from_groups/index.js');
  handler = module.handler;
});

// Reset mocks before each test
beforeEach(() => {
  mockSend.mockReset();
  utils.getAuthToken.mockClear();
  utils.verifyToken.mockClear();
  utils.parseBody.mockClear();
  utils.formatResponse.mockClear();
});

describe('remove_user_from_groups Lambda', () => {
  it('should remove a user from groups successfully', async () => {
    // Mock event
    const event = {
      headers: { Authorization: 'Bearer admin' },
      body: JSON.stringify({
        username: 'test-user',
        groups: ['Group1', 'Group2']
      })
    };

    // Mock successful Cognito responses
    mockSend.mockResolvedValueOnce({});
    mockSend.mockResolvedValueOnce({});

    // Call handler
    const response = await handler(event);

    // Verify response
    expect(response.statusCode).toBe(200);
    const responseBody = JSON.parse(response.body);
    expect(responseBody.message).toBe('User removed from groups successfully');
    expect(responseBody.requiresSessionUpdate).toBe(false);

    // Verify Cognito calls
    expect(mockSend).toHaveBeenCalledTimes(2);
    
    // Check first group removal
    const firstCommand = mockSend.mock.calls[0][0];
    expect(firstCommand.constructor.name).toBe('AdminRemoveUserFromGroupCommand');
    expect(firstCommand.UserPoolId).toBe('test-user-pool-id');
    expect(firstCommand.Username).toBe('test-user');
    expect(firstCommand.GroupName).toBe('Group1');
    
    // Check second group removal
    const secondCommand = mockSend.mock.calls[1][0];
    expect(secondCommand.constructor.name).toBe('AdminRemoveUserFromGroupCommand');
    expect(secondCommand.UserPoolId).toBe('test-user-pool-id');
    expect(secondCommand.Username).toBe('test-user');
    expect(secondCommand.GroupName).toBe('Group2');
  });

  it('should set requiresSessionUpdate to true when removing current user from groups', async () => {
    // Mock event
    const event = {
      headers: { Authorization: 'Bearer admin' },
      body: JSON.stringify({
        username: 'admin-user', // Same as the current user's sub
        groups: ['Group1']
      })
    };

    // Mock successful Cognito response
    mockSend.mockResolvedValueOnce({});

    // Call handler
    const response = await handler(event);

    // Verify response
    expect(response.statusCode).toBe(200);
    const responseBody = JSON.parse(response.body);
    expect(responseBody.message).toBe('User removed from groups successfully');
    expect(responseBody.requiresSessionUpdate).toBe(true);

    // Verify Cognito call
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('should return 403 if user is not an Admin', async () => {
    // Mock event with non-admin token
    const event = {
      headers: { Authorization: 'Bearer validToken' }, // This token resolves to a non-admin user
      body: JSON.stringify({
        username: 'test-user',
        groups: ['Group1']
      })
    };

    // Call handler
    const response = await handler(event);

    // Verify response
    expect(response.statusCode).toBe(403);
    const responseBody = JSON.parse(response.body);
    expect(responseBody.message).toContain('Forbidden');

    // Verify no Cognito calls were made
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('should return 400 if username is missing', async () => {
    // Mock event with missing username
    const event = {
      headers: { Authorization: 'Bearer admin' },
      body: JSON.stringify({
        groups: ['Group1']
      })
    };

    // Call handler
    const response = await handler(event);

    // Verify response
    expect(response.statusCode).toBe(400);
    const responseBody = JSON.parse(response.body);
    expect(responseBody.message).toContain('Username and at least one group are required');

    // Verify no Cognito calls were made
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('should return 400 if groups array is empty', async () => {
    // Mock event with empty groups array
    const event = {
      headers: { Authorization: 'Bearer admin' },
      body: JSON.stringify({
        username: 'test-user',
        groups: []
      })
    };

    // Call handler
    const response = await handler(event);

    // Verify response
    expect(response.statusCode).toBe(400);
    const responseBody = JSON.parse(response.body);
    expect(responseBody.message).toContain('Username and at least one group are required');

    // Verify no Cognito calls were made
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('should return 400 if groups is not an array', async () => {
    // Mock event with non-array groups
    const event = {
      headers: { Authorization: 'Bearer admin' },
      body: JSON.stringify({
        username: 'test-user',
        groups: 'Group1' // String instead of array
      })
    };

    // Call handler
    const response = await handler(event);

    // Verify response
    expect(response.statusCode).toBe(400);
    const responseBody = JSON.parse(response.body);
    expect(responseBody.message).toContain('Username and at least one group are required');

    // Verify no Cognito calls were made
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('should return 401 for unauthorized access', async () => {
    // Mock event with invalid token
    const event = {
      headers: { Authorization: 'Bearer invalid' }
    };

    // Call handler
    const response = await handler(event);

    // Verify response
    expect(response.statusCode).toBe(401);
    const responseBody = JSON.parse(response.body);
    expect(responseBody.message).toBe('Unauthorized');

    // Verify no Cognito calls were made
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('should return 500 for Cognito service errors', async () => {
    // Mock event
    const event = {
      headers: { Authorization: 'Bearer admin' },
      body: JSON.stringify({
        username: 'test-user',
        groups: ['Group1']
      })
    };

    // Mock Cognito to throw an error
    mockSend.mockRejectedValueOnce(new Error('Cognito service error'));

    // Call handler
    const response = await handler(event);

    // Verify response
    expect(response.statusCode).toBe(500);
    const responseBody = JSON.parse(response.body);
    expect(responseBody.message).toBe('Cognito service error');

    // Verify Cognito call was attempted
    expect(mockSend).toHaveBeenCalledTimes(1);
  });
});
