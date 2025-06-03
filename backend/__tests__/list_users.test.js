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
      sub: 'user1'
    });
  }),
  formatResponse: jest.fn((status, body) => ({ statusCode: status, body: JSON.stringify(body) }))
}), { virtual: true });

// Set environment variables
process.env.USER_POOL_ID = 'test-user-pool-id';
process.env.AWS_REGION = 'us-east-1';

let handler;
import { CognitoIdentityProviderClient, ListUsersCommand } from '@aws-sdk/client-cognito-identity-provider';
import * as utils from '/opt/utils.js';

beforeAll(async () => {
  // Dynamically import the handler after mocks are set
  handler = (await import('../list_users/index.js')).handler;
});

describe('list_users Lambda', () => {
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
  });

  it('should list users successfully', async () => {
    // Mock event
    const event = {
      headers: { Authorization: 'Bearer validToken' }
    };

    // Mock Cognito response
    mockSend.mockResolvedValueOnce({
      Users: [
        {
          Username: 'user1',
          Attributes: [
            { Name: 'email', Value: 'user1@example.com' },
            { Name: 'given_name', Value: 'John' },
            { Name: 'family_name', Value: 'Doe' }
          ],
          Enabled: true,
          UserStatus: 'CONFIRMED'
        },
        {
          Username: 'user2',
          Attributes: [
            { Name: 'email', Value: 'user2@example.com' }
            // No name attributes
          ],
          Enabled: true,
          UserStatus: 'CONFIRMED'
        }
      ],
      PaginationToken: null
    });

    // Call handler
    const response = await handler(event);

    // Verify response
    expect(response.statusCode).toBe(200);
    const responseBody = JSON.parse(response.body);
    expect(responseBody.users).toHaveLength(2);
    
    // First user should have formatted label with name
    expect(responseBody.users[0]).toEqual({
      value: 'user1',
      label: 'John Doe (user1@example.com)',
      email: 'user1@example.com',
      given_name: 'John',
      family_name: 'Doe'
    });
    
    // Second user should have email as label
    expect(responseBody.users[1]).toEqual({
      value: 'user2',
      label: 'user2@example.com',
      email: 'user2@example.com',
      given_name: '',
      family_name: ''
    });

    // Verify Cognito call
    expect(mockSend).toHaveBeenCalledTimes(1);
    const listUsersCommand = mockSend.mock.calls[0][0];
    expect(listUsersCommand.constructor.name).toBe('ListUsersCommand');
    expect(listUsersCommand.UserPoolId).toBe('test-user-pool-id');
    expect(listUsersCommand.AttributesToGet).toEqual(['email', 'given_name', 'family_name']);
    expect(listUsersCommand.Limit).toBe(60);
  });

  it('should handle pagination when listing users', async () => {
    // Mock event
    const event = {
      headers: { Authorization: 'Bearer validToken' }
    };

    // Mock Cognito responses with pagination
    mockSend
      .mockResolvedValueOnce({
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
        PaginationToken: 'page2Token'
      })
      .mockResolvedValueOnce({
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
        PaginationToken: null
      });

    // Call handler
    const response = await handler(event);

    // Verify response
    expect(response.statusCode).toBe(200);
    const responseBody = JSON.parse(response.body);
    expect(responseBody.users).toHaveLength(2);
    
    // Verify users are sorted alphabetically
    expect(responseBody.users[0].value).toBe('user1');
    expect(responseBody.users[1].value).toBe('user2');

    // Verify Cognito calls
    expect(mockSend).toHaveBeenCalledTimes(2);
    
    // First call should not have PaginationToken
    const firstCommand = mockSend.mock.calls[0][0];
    expect(firstCommand.constructor.name).toBe('ListUsersCommand');
    expect(firstCommand.PaginationToken).toBeUndefined();
    
    // Second call should have PaginationToken
    const secondCommand = mockSend.mock.calls[1][0];
    expect(secondCommand.constructor.name).toBe('ListUsersCommand');
    expect(secondCommand.PaginationToken).toBe('page2Token');
  });

  it('should sort users by name when available, then by email', async () => {
    // Mock event
    const event = {
      headers: { Authorization: 'Bearer validToken' }
    };

    // Mock Cognito response with unsorted users
    mockSend.mockResolvedValueOnce({
      Users: [
        {
          Username: 'user3',
          Attributes: [
            { Name: 'email', Value: 'c@example.com' }
            // No name
          ],
          Enabled: true,
          UserStatus: 'CONFIRMED'
        },
        {
          Username: 'user1',
          Attributes: [
            { Name: 'email', Value: 'a@example.com' },
            { Name: 'given_name', Value: 'Zebra' },
            { Name: 'family_name', Value: 'Smith' }
          ],
          Enabled: true,
          UserStatus: 'CONFIRMED'
        },
        {
          Username: 'user2',
          Attributes: [
            { Name: 'email', Value: 'b@example.com' },
            { Name: 'given_name', Value: 'Apple' },
            { Name: 'family_name', Value: 'Jones' }
          ],
          Enabled: true,
          UserStatus: 'CONFIRMED'
        },
        {
          Username: 'user4',
          Attributes: [
            { Name: 'email', Value: 'd@example.com' }
            // No name
          ],
          Enabled: true,
          UserStatus: 'CONFIRMED'
        }
      ],
      PaginationToken: null
    });

    // Call handler
    const response = await handler(event);

    // Verify response
    expect(response.statusCode).toBe(200);
    const responseBody = JSON.parse(response.body);
    expect(responseBody.users).toHaveLength(4);
    
    // Users with names should come first, sorted by name
    expect(responseBody.users[0].value).toBe('user2'); // Apple Jones
    expect(responseBody.users[1].value).toBe('user1'); // Zebra Smith
    
    // Then users without names, sorted by email
    expect(responseBody.users[2].value).toBe('user3'); // c@example.com
    expect(responseBody.users[3].value).toBe('user4'); // d@example.com

    // Verify Cognito call
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('should handle empty user list', async () => {
    // Mock event
    const event = {
      headers: { Authorization: 'Bearer validToken' }
    };

    // Mock Cognito response with no users
    mockSend.mockResolvedValueOnce({
      Users: [],
      PaginationToken: null
    });

    // Call handler
    const response = await handler(event);

    // Verify response
    expect(response.statusCode).toBe(200);
    const responseBody = JSON.parse(response.body);
    expect(responseBody.users).toHaveLength(0);

    // Verify Cognito call
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('should handle users with partial name information', async () => {
    // Mock event
    const event = {
      headers: { Authorization: 'Bearer validToken' }
    };

    // Mock Cognito response with users having partial name info
    mockSend.mockResolvedValueOnce({
      Users: [
        {
          Username: 'user1',
          Attributes: [
            { Name: 'email', Value: 'user1@example.com' },
            { Name: 'given_name', Value: 'John' }
            // No family_name
          ],
          Enabled: true,
          UserStatus: 'CONFIRMED'
        },
        {
          Username: 'user2',
          Attributes: [
            { Name: 'email', Value: 'user2@example.com' },
            { Name: 'family_name', Value: 'Smith' }
            // No given_name
          ],
          Enabled: true,
          UserStatus: 'CONFIRMED'
        }
      ],
      PaginationToken: null
    });

    // Call handler
    const response = await handler(event);

    // Verify response
    expect(response.statusCode).toBe(200);
    const responseBody = JSON.parse(response.body);
    expect(responseBody.users).toHaveLength(2);
    
    // First user should have just given_name in label
    expect(responseBody.users[0].label).toBe('John (user1@example.com)');
    
    // Second user should have just family_name in label
    expect(responseBody.users[1].label).toBe('Smith (user2@example.com)');

    // Verify Cognito call
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('should handle users with non-email usernames', async () => {
    // Mock event
    const event = {
      headers: { Authorization: 'Bearer validToken' }
    };

    // Mock Cognito response with non-email usernames
    mockSend.mockResolvedValueOnce({
      Users: [
        {
          Username: 'user1',
          Attributes: [
            { Name: 'email', Value: 'not-an-email' }
          ],
          Enabled: true,
          UserStatus: 'CONFIRMED'
        }
      ],
      PaginationToken: null
    });

    // Call handler
    const response = await handler(event);

    // Verify response
    expect(response.statusCode).toBe(200);
    const responseBody = JSON.parse(response.body);
    expect(responseBody.users).toHaveLength(1);
    
    // Label should just be the value without parentheses
    expect(responseBody.users[0].label).toBe('not-an-email');

    // Verify Cognito call
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('should return 401 for unauthorized access', async () => {
    // Mock event with no token
    const event = {
      headers: {}
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

  it('should return 500 for other errors', async () => {
    // Mock event
    const event = {
      headers: { Authorization: 'Bearer validToken' }
    };

    // Mock Cognito to throw an error
    mockSend.mockRejectedValueOnce(new Error('Cognito service error'));

    // Call handler
    const response = await handler(event);

    // Verify response
    expect(response.statusCode).toBe(500);
    const responseBody = JSON.parse(response.body);
    expect(responseBody).toEqual({ message: 'Cognito service error' });

    // Verify Cognito call was attempted
    expect(mockSend).toHaveBeenCalledTimes(1);
  });
});
