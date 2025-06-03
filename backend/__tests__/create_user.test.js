// Mock AWS SDK
const mockSend = jest.fn().mockResolvedValue({});

jest.mock('@aws-sdk/client-cognito-identity-provider', () => ({
  __esModule: true,
  CognitoIdentityProviderClient: jest.fn().mockImplementation(() => ({
    send: mockSend
  })),
  AdminCreateUserCommand: jest.fn().mockImplementation(params => ({ params }))
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
import { CognitoIdentityProviderClient, AdminCreateUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import * as utils from '/opt/utils.js';

// Set up environment variables
process.env.USER_POOL_ID = 'test-user-pool-id';
process.env.AWS_REGION = 'us-east-1';

beforeAll(async () => {
  // Dynamically import the handler after mocks are set
  handler = (await import('../create_user/index.js')).handler;
});

describe('create_user Lambda', () => {
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
  });

  test('should create user with all attributes', async () => {
    const event = {
      headers: {
        Authorization: 'Bearer test-token'
      },
      body: JSON.stringify({
        email: 'test@example.com',
        given_name: 'Test',
        family_name: 'User'
      })
    };

    const result = await handler(event);
    
    expect(utils.getAuthToken).toHaveBeenCalledWith(event);
    expect(utils.verifyToken).toHaveBeenCalledWith('test-token');
    expect(mockSend).toHaveBeenCalledTimes(1);
    
    expect(AdminCreateUserCommand).toHaveBeenCalledWith({
      UserPoolId: 'test-user-pool-id',
      Username: 'test@example.com',
      UserAttributes: [
        { Name: 'email', Value: 'test@example.com' },
        { Name: 'email_verified', Value: 'true' },
        { Name: 'given_name', Value: 'Test' },
        { Name: 'family_name', Value: 'User' }
      ]
    });
    
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({
      message: 'test@example.com user created successfully'
    });
  });

  test('should create user with only email', async () => {
    const event = {
      headers: {
        Authorization: 'Bearer test-token'
      },
      body: JSON.stringify({
        email: 'minimal@example.com'
      })
    };

    const result = await handler(event);
    
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(AdminCreateUserCommand).toHaveBeenCalledWith({
      UserPoolId: 'test-user-pool-id',
      Username: 'minimal@example.com',
      UserAttributes: [
        { Name: 'email', Value: 'minimal@example.com' },
        { Name: 'email_verified', Value: 'true' }
      ]
    });
    
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({
      message: 'minimal@example.com user created successfully'
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
        email: 'test@example.com'
      })
    };

    const result = await handler(event);
    
    expect(result.statusCode).toBe(403);
    expect(JSON.parse(result.body)).toEqual({
      message: 'Forbidden: Only Admin users can perform this action'
    });
  });

  test('should return 400 for missing email', async () => {
    const event = {
      headers: {
        Authorization: 'Bearer test-token'
      },
      body: JSON.stringify({
        given_name: 'Test',
        family_name: 'User'
      })
    };

    const result = await handler(event);
    
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({
      message: 'Invalid request: email is required'
    });
  });

  test('should return 401 for unauthorized access', async () => {
    // Make verifyToken reject with Unauthorized error
    utils.verifyToken.mockRejectedValueOnce(new Error('Unauthorized'));

    const event = {
      headers: {
        Authorization: 'Bearer invalid-token'
      },
      body: JSON.stringify({
        email: 'test@example.com'
      })
    };

    const result = await handler(event);
    
    expect(result.statusCode).toBe(401);
    expect(JSON.parse(result.body).message).toBe('Unauthorized');
  });

  test('should return 400 for Cognito errors', async () => {
    // Make the send method reject with an error
    mockSend.mockRejectedValueOnce(new Error('User already exists'));

    const event = {
      headers: {
        Authorization: 'Bearer test-token'
      },
      body: JSON.stringify({
        email: 'existing@example.com'
      })
    };

    const result = await handler(event);
    
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('User already exists');
  });
});
