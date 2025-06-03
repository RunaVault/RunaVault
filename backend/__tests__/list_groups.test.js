// Mock AWS SDK
const mockSend = jest.fn();

// Mock console.error to suppress error messages during tests
const originalConsoleError = console.error;
beforeAll(() => {
  console.error = jest.fn();
});

afterAll(() => {
  console.error = originalConsoleError;
});

jest.mock('@aws-sdk/client-cognito-identity-provider', () => {
  const originalModule = jest.requireActual('@aws-sdk/client-cognito-identity-provider');
  
  return {
    __esModule: true,
    ...originalModule,
    CognitoIdentityProviderClient: jest.fn().mockImplementation(() => ({
      send: mockSend
    })),
    ListGroupsCommand: jest.fn().mockImplementation(params => ({
      ...params,
      constructor: { name: 'ListGroupsCommand' }
    }))
  };
});

// Mock utils module
jest.mock('/opt/utils.js', () => ({
  __esModule: true,
  getAuthToken: jest.fn((event) => event.headers?.Authorization?.replace('Bearer ', '') || ''),
  verifyToken: jest.fn((token) => {
    if (!token) return Promise.reject(new Error('Unauthorized'));
    return Promise.resolve();
  }),
  formatResponse: jest.fn((status, body) => ({ statusCode: status, body: JSON.stringify(body) }))
}), { virtual: true });

// Set environment variables
process.env.USER_POOL_ID = 'test-user-pool-id';
process.env.AWS_REGION = 'us-east-1';

let handler;
import { CognitoIdentityProviderClient, ListGroupsCommand } from '@aws-sdk/client-cognito-identity-provider';
import * as utils from '/opt/utils.js';

beforeAll(async () => {
  // Dynamically import the handler after mocks are set
  handler = (await import('../list_groups/index.js')).handler;
});

describe('list_groups Lambda', () => {
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
  });

  it('should list groups successfully', async () => {
    // Mock event
    const event = {
      headers: { Authorization: 'Bearer validToken' }
    };

    // Mock Cognito response
    mockSend.mockResolvedValueOnce({
      Groups: [
        { GroupName: 'Admins' },
        { GroupName: 'Developers' },
        { GroupName: 'Users' }
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
        { value: 'Developers', label: 'Developers' },
        { value: 'Users', label: 'Users' }
      ]
    });

    // Verify Cognito call
    expect(mockSend).toHaveBeenCalledTimes(1);
    const listGroupsCommand = mockSend.mock.calls[0][0];
    expect(listGroupsCommand.constructor.name).toBe('ListGroupsCommand');
    expect(listGroupsCommand.UserPoolId).toBe('test-user-pool-id');
    expect(listGroupsCommand.Limit).toBe(60);
  });

  it('should handle pagination when listing groups', async () => {
    // Mock event
    const event = {
      headers: { Authorization: 'Bearer validToken' }
    };

    // Mock Cognito responses with pagination
    mockSend
      .mockResolvedValueOnce({
        Groups: [
          { GroupName: 'Admins' },
          { GroupName: 'Developers' }
        ],
        NextToken: 'page2Token'
      })
      .mockResolvedValueOnce({
        Groups: [
          { GroupName: 'Users' },
          { GroupName: 'Guests' }
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
        { value: 'Developers', label: 'Developers' },
        { value: 'Guests', label: 'Guests' },
        { value: 'Users', label: 'Users' }
      ]
    });

    // Verify Cognito calls
    expect(mockSend).toHaveBeenCalledTimes(2);
    
    // First call should not have NextToken
    const firstCommand = mockSend.mock.calls[0][0];
    expect(firstCommand.constructor.name).toBe('ListGroupsCommand');
    expect(firstCommand.NextToken).toBeUndefined();
    
    // Second call should have NextToken
    const secondCommand = mockSend.mock.calls[1][0];
    expect(secondCommand.constructor.name).toBe('ListGroupsCommand');
    expect(secondCommand.NextToken).toBe('page2Token');
  });

  it('should return empty array when no groups exist', async () => {
    // Mock event
    const event = {
      headers: { Authorization: 'Bearer validToken' }
    };

    // Mock Cognito response with no groups
    mockSend.mockResolvedValueOnce({
      Groups: [],
      NextToken: null
    });

    // Call handler
    const response = await handler(event);

    // Verify response
    expect(response.statusCode).toBe(200);
    const responseBody = JSON.parse(response.body);
    expect(responseBody).toEqual({
      groups: []
    });

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

  it('should sort groups alphabetically', async () => {
    // Mock event
    const event = {
      headers: { Authorization: 'Bearer validToken' }
    };

    // Mock Cognito response with unsorted groups
    mockSend.mockResolvedValueOnce({
      Groups: [
        { GroupName: 'Zebras' },
        { GroupName: 'Apples' },
        { GroupName: 'Monkeys' }
      ],
      NextToken: null
    });

    // Call handler
    const response = await handler(event);

    // Verify response has sorted groups
    expect(response.statusCode).toBe(200);
    const responseBody = JSON.parse(response.body);
    expect(responseBody).toEqual({
      groups: [
        { value: 'Apples', label: 'Apples' },
        { value: 'Monkeys', label: 'Monkeys' },
        { value: 'Zebras', label: 'Zebras' }
      ]
    });

    // Verify Cognito call
    expect(mockSend).toHaveBeenCalledTimes(1);
  });
});
