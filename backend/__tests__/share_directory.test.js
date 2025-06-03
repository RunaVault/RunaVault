/**
 * Test file for share_directory Lambda function
 */

// Mock AWS SDK
const mockSend = jest.fn();

// Mock console methods to suppress output during tests
console.error = jest.fn();
console.log = jest.fn();
console.warn = jest.fn();

// Mock AWS SDK
jest.mock('@aws-sdk/client-dynamodb', () => {
  return {
    __esModule: true,
    DynamoDBClient: jest.fn().mockImplementation(() => ({
      send: mockSend
    })),
    QueryCommand: jest.fn().mockImplementation(params => ({
      ...params,
      constructor: { name: 'QueryCommand' }
    })),
    PutItemCommand: jest.fn().mockImplementation(params => ({
      ...params,
      constructor: { name: 'PutItemCommand' }
    })),
    DeleteItemCommand: jest.fn().mockImplementation(params => ({
      ...params,
      constructor: { name: 'DeleteItemCommand' }
    }))
  };
});

// Mock utils module
jest.mock('/opt/utils.js', () => ({
  getAuthToken: jest.fn((event) => event.headers?.Authorization?.replace('Bearer ', '') || ''),
  verifyToken: jest.fn((token) => {
    if (!token || token === 'invalid') return Promise.reject(new Error('Unauthorized'));
    return Promise.resolve({
      sub: 'user1',
      'cognito:groups': ['Users']
    });
  }),
  parseBody: jest.fn((body) => JSON.parse(body || '{}')),
  formatResponse: jest.fn((status, body) => ({ statusCode: status, body: JSON.stringify(body) }))
}), { virtual: true });

// Import utils
const utils = require('/opt/utils.js');

// Set environment variables
process.env.TABLE_PREFIX = 'Test_';

// Import the handler
let handler;
beforeAll(() => {
  jest.isolateModules(() => {
    const module = require('../share_directory/index.js');
    handler = module.handler;
  });
});

beforeEach(() => {
  // Reset mocks before each test
  mockSend.mockReset();
  utils.getAuthToken.mockClear();
  utils.verifyToken.mockClear();
  utils.parseBody.mockClear();
  utils.formatResponse.mockClear();
});

describe('share_directory Lambda', () => {
  it('should return 404 if no secrets are found in the directory', async () => {
    // Mock event
    const event = {
      headers: { Authorization: 'Bearer validToken' },
      body: JSON.stringify({
        subdirectory: 'nonexistent',
        sharedWith: {
          users: ['user2'],
          groups: ['Group1']
        }
      })
    };

    // Mock empty query response
    mockSend.mockResolvedValueOnce({ Items: [] });

    // Call handler
    const response = await handler(event);

    // Verify response
    expect(response.statusCode).toBe(404);
    const responseBody = JSON.parse(response.body);
    expect(responseBody.message).toBe('No secrets found in the specified directory');
  });

  it('should return 401 for unauthorized access', async () => {
    // Mock event with invalid token
    const event = {
      headers: { Authorization: 'Bearer invalid' },
      body: JSON.stringify({
        subdirectory: 'work',
        sharedWith: {
          users: ['user2'],
          groups: ['Group1']
        }
      })
    };

    // Call handler
    const response = await handler(event);

    // Verify response
    expect(response.statusCode).toBe(401);
    const responseBody = JSON.parse(response.body);
    expect(responseBody.message).toBe('Unauthorized');
  });

  it('should return 400 if subdirectory is missing', async () => {
    // Mock event with missing subdirectory
    const event = {
      headers: { Authorization: 'Bearer validToken' },
      body: JSON.stringify({
        sharedWith: {
          users: ['user2'],
          groups: ['Group1']
        }
      })
    };

    // Call handler
    const response = await handler(event);

    // Verify response
    expect(response.statusCode).toBe(400);
    const responseBody = JSON.parse(response.body);
    expect(responseBody.message).toContain('Missing subdirectory parameter');

    // Verify no DynamoDB calls were made
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('should return 400 if sharedWith is missing or invalid', async () => {
    // Mock event with missing sharedWith
    const event = {
      headers: { Authorization: 'Bearer validToken' },
      body: JSON.stringify({
        subdirectory: 'work'
      })
    };

    // Call handler
    const response = await handler(event);

    // Verify response
    expect(response.statusCode).toBe(400);
    const responseBody = JSON.parse(response.body);
    expect(responseBody.message).toContain('Invalid or missing \'sharedWith\' parameter');

    // Verify no DynamoDB calls were made
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('should return 400 if no users or groups are specified', async () => {
    // Mock event with empty users and groups arrays
    const event = {
      headers: { Authorization: 'Bearer validToken' },
      body: JSON.stringify({
        subdirectory: 'work',
        sharedWith: {
          users: [],
          groups: []
        }
      })
    };

    // Call handler
    const response = await handler(event);

    // Verify response
    expect(response.statusCode).toBe(400);
    const responseBody = JSON.parse(response.body);
    expect(responseBody.message).toContain('At least one user or group must be specified');

    // Verify no DynamoDB calls were made
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('should return 500 for DynamoDB service errors', async () => {
    // Mock event
    const event = {
      headers: { Authorization: 'Bearer validToken' },
      body: JSON.stringify({
        subdirectory: 'work',
        sharedWith: {
          users: ['user2'],
          groups: ['Group1']
        }
      })
    };

    // Mock DynamoDB query error
    mockSend.mockRejectedValueOnce(new Error('DynamoDB service error'));

    // Call handler
    const response = await handler(event);

    // Verify response
    expect(response.statusCode).toBe(500);
    const responseBody = JSON.parse(response.body);
    expect(responseBody.message).toBe('DynamoDB service error');
  });
  
  it('should successfully share a directory when items exist', async () => {
    // Mock event
    const event = {
      headers: { Authorization: 'Bearer validToken' },
      body: JSON.stringify({
        subdirectory: 'work',
        sharedWith: {
          users: ['user2'],
          groups: ['Group1']
        }
      })
    };

    // Mock successful query with items
    mockSend.mockResolvedValueOnce({
      Items: [
        {
          user_id: { S: 'user1' },
          site: { S: 'example.com#password123' },
          username: { S: 'testuser' },
          password: { S: JSON.stringify({ encryptedPassword: 'encrypted-data' }) },
          subdirectory: { S: 'work' }
        }
      ]
    });
    
    // Mock all other DynamoDB operations to succeed
    mockSend.mockResolvedValue({});

    // Call handler
    const response = await handler(event);

    // Verify response
    expect(response.statusCode).toBe(200);
    const responseBody = JSON.parse(response.body);
    expect(responseBody.message).toBe('Directory shared successfully');
  });
});
