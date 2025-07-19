/**
 * Test file for edit_users Lambda function
 */

import { jest } from '@jest/globals';
import { CognitoIdentityProviderClient, AdminDeleteUserCommand, AdminUpdateUserAttributesCommand, AdminResetUserPasswordCommand } from '@aws-sdk/client-cognito-identity-provider';

// Mock AWS SDK
const mockSend = jest.fn();

// Mock console methods to suppress output during tests
console.error = jest.fn();
console.log = jest.fn();
console.warn = jest.fn();

jest.mock('@aws-sdk/client-cognito-identity-provider', () => {
  return {
    CognitoIdentityProviderClient: jest.fn().mockImplementation(() => ({
      send: mockSend
    })),
    AdminDeleteUserCommand: jest.fn().mockImplementation(params => ({
      ...params,
      constructor: { name: 'AdminDeleteUserCommand' }
    })),
    AdminUpdateUserAttributesCommand: jest.fn().mockImplementation(params => ({
      ...params,
      constructor: { name: 'AdminUpdateUserAttributesCommand' }
    })),
    AdminResetUserPasswordCommand: jest.fn().mockImplementation(params => ({
      ...params,
      constructor: { name: 'AdminResetUserPasswordCommand' }
    }))
  };
});

// Mock utils module
const mockGetAuthToken = jest.fn();
const mockVerifyToken = jest.fn();
const mockParseBody = jest.fn();
const mockFormatResponse = jest.fn();

jest.mock('/opt/utils.js', () => {
  return {
    getAuthToken: mockGetAuthToken,
    verifyToken: mockVerifyToken,
    parseBody: mockParseBody,
    formatResponse: mockFormatResponse
  };
}, { virtual: true });

// Set environment variables
process.env.USER_POOL_ID = 'test-user-pool-id';
process.env.AWS_REGION = 'us-east-1';

let handler;

describe('edit_users Lambda', () => {
  beforeAll(async () => {
    // Dynamically import the handler after mocks are set
    const module = await import('../edit_users/index.js');
    handler = module.handler;
  });

  beforeEach(() => {
    // Reset mocks before each test
    mockSend.mockReset();
    mockGetAuthToken.mockReset();
    mockVerifyToken.mockReset();
    mockParseBody.mockReset();
    mockFormatResponse.mockReset();
    
    // Set up default mock implementations
    mockGetAuthToken.mockImplementation((event) => event.headers?.Authorization?.replace('Bearer ', '') || '');
    mockVerifyToken.mockImplementation((token) => {
      if (!token || token === 'invalid') return Promise.reject(new Error('Unauthorized'));
      if (token === 'admin') {
        return Promise.resolve({
          sub: 'admin1',
          'cognito:groups': ['Admin']
        });
      }
      return Promise.resolve({
        sub: 'user1',
        'cognito:groups': ['Users']
      });
    });
    mockParseBody.mockImplementation((body) => JSON.parse(body || '{}'));
    mockFormatResponse.mockImplementation((status, body) => ({ statusCode: status, body: JSON.stringify(body) }));
  });
  it('should delete a user successfully', async () => {
    // Mock event
    const event = {
      headers: { Authorization: 'Bearer admin' },
      body: JSON.stringify({
        username: 'testuser',
        deleteUser: true
      })
    };

    // Mock Cognito response
    mockSend.mockResolvedValueOnce({});

    // Call handler
    const response = await handler(event);

    // Verify response
    expect(response.statusCode).toBe(200);
    const responseBody = JSON.parse(response.body);
    expect(responseBody.message).toBe('User deleted successfully');

    // Verify Cognito calls
    expect(mockSend).toHaveBeenCalledTimes(1);
    
    // Check delete command
    const deleteCommand = mockSend.mock.calls[0][0];
    expect(deleteCommand.constructor.name).toBe('AdminDeleteUserCommand');
    expect(deleteCommand.UserPoolId).toBe('test-user-pool-id');
    expect(deleteCommand.Username).toBe('testuser');
  });

  it('should update user attributes successfully', async () => {
    // Mock event
    const event = {
      headers: { Authorization: 'Bearer admin' },
      body: JSON.stringify({
        username: 'testuser',
        editUser: true,
        newUsername: 'newemail@example.com',
        given_name: 'New',
        family_name: 'User'
      })
    };

    // Mock Cognito response
    mockSend.mockResolvedValueOnce({});

    // Call handler
    const response = await handler(event);

    // Verify response
    expect(response.statusCode).toBe(200);
    const responseBody = JSON.parse(response.body);
    expect(responseBody.message).toBe('User updated successfully');

    // Verify Cognito calls
    expect(mockSend).toHaveBeenCalledTimes(1);
    
    // Check update command
    const updateCommand = mockSend.mock.calls[0][0];
    expect(updateCommand.constructor.name).toBe('AdminUpdateUserAttributesCommand');
    expect(updateCommand.UserPoolId).toBe('test-user-pool-id');
    expect(updateCommand.Username).toBe('testuser');
    expect(updateCommand.UserAttributes).toContainEqual({ 
      Name: 'email', 
      Value: 'newemail@example.com' 
    });
    expect(updateCommand.UserAttributes).toContainEqual({ 
      Name: 'given_name', 
      Value: 'New' 
    });
    expect(updateCommand.UserAttributes).toContainEqual({ 
      Name: 'family_name', 
      Value: 'User' 
    });
  });

  it('should reset user password successfully', async () => {
    // Mock event
    const event = {
      headers: { Authorization: 'Bearer admin' },
      body: JSON.stringify({
        username: 'testuser',
        editUser: true,
        password: 'newpassword'
      })
    };

    // Mock Cognito response
    mockSend.mockResolvedValueOnce({});

    // Call handler
    const response = await handler(event);

    // Verify response
    expect(response.statusCode).toBe(200);
    const responseBody = JSON.parse(response.body);
    expect(responseBody.message).toBe('User updated successfully');

    // Verify Cognito calls
    expect(mockSend).toHaveBeenCalledTimes(1);
    
    // Check password reset command
    const passwordCommand = mockSend.mock.calls[0][0];
    expect(passwordCommand.constructor.name).toBe('AdminResetUserPasswordCommand');
    expect(passwordCommand.UserPoolId).toBe('test-user-pool-id');
    expect(passwordCommand.Username).toBe('testuser');
  });

  it('should update multiple user attributes and reset password', async () => {
    // Mock event
    const event = {
      headers: { Authorization: 'Bearer admin' },
      body: JSON.stringify({
        username: 'testuser',
        editUser: true,
        given_name: 'New',
        family_name: 'User',
        password: 'newpassword'
      })
    };

    // Mock Cognito responses
    mockSend.mockResolvedValueOnce({}).mockResolvedValueOnce({});

    // Call handler
    const response = await handler(event);

    // Verify response
    expect(response.statusCode).toBe(200);
    const responseBody = JSON.parse(response.body);
    expect(responseBody.message).toBe('User updated successfully');

    // Verify Cognito calls
    expect(mockSend).toHaveBeenCalledTimes(2);
    
    // Check update command
    const updateCommand = mockSend.mock.calls[0][0];
    expect(updateCommand.constructor.name).toBe('AdminUpdateUserAttributesCommand');
    
    // Check password reset command
    const passwordCommand = mockSend.mock.calls[1][0];
    expect(passwordCommand.constructor.name).toBe('AdminResetUserPasswordCommand');
  });

  it('should return 400 if username is missing', async () => {
    // Mock event with missing username
    const event = {
      headers: { Authorization: 'Bearer admin' },
      body: JSON.stringify({
        deleteUser: true
      })
    };

    // Call handler
    const response = await handler(event);

    // Verify response
    expect(response.statusCode).toBe(400);
    const responseBody = JSON.parse(response.body);
    expect(responseBody.message).toBe('Username is required');
  });

  it('should return 400 if no valid action is specified', async () => {
    // Mock event with no action
    const event = {
      headers: { Authorization: 'Bearer admin' },
      body: JSON.stringify({
        username: 'testuser'
      })
    };

    // Call handler
    const response = await handler(event);

    // Verify response
    expect(response.statusCode).toBe(400);
    const responseBody = JSON.parse(response.body);
    expect(responseBody.message).toBe('No valid action specified (delete or edit)');
  });

  it('should return 401 for unauthorized access', async () => {
    // Mock event with invalid token
    const event = {
      headers: { Authorization: 'Bearer invalid' },
      body: JSON.stringify({
        username: 'testuser',
        deleteUser: true
      })
    };

    // Call handler
    const response = await handler(event);

    // Verify response
    expect(response.statusCode).toBe(401);
    const responseBody = JSON.parse(response.body);
    expect(responseBody.message).toBe('Unauthorized');
  });

  it('should return 403 if user is not an admin', async () => {
    // Mock event with non-admin token
    const event = {
      headers: { Authorization: 'Bearer validToken' },
      body: JSON.stringify({
        username: 'testuser',
        deleteUser: true
      })
    };

    // Call handler
    const response = await handler(event);

    // Verify response
    expect(response.statusCode).toBe(403);
    const responseBody = JSON.parse(response.body);
    expect(responseBody.message).toBe('Forbidden: Only Admin users can perform this action');
  });

  it('should return 500 for Cognito service errors', async () => {
    // Mock event
    const event = {
      headers: { Authorization: 'Bearer admin' },
      body: JSON.stringify({
        username: 'testuser',
        deleteUser: true
      })
    };

    // Mock Cognito error
    mockSend.mockRejectedValueOnce(new Error('Cognito service error'));

    // Call handler
    const response = await handler(event);

    // Verify response
    expect(response.statusCode).toBe(500);
    const responseBody = JSON.parse(response.body);
    expect(responseBody.message).toBe('Cognito service error');
  });
});
