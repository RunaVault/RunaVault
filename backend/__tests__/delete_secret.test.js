/**
 * Test file for delete_secret Lambda function
 */

import { jest } from '@jest/globals';
import { DynamoDBClient, QueryCommand, DeleteItemCommand } from '@aws-sdk/client-dynamodb';

// Mock AWS SDK
const mockSend = jest.fn();

// Mock console methods to suppress output during tests
console.error = jest.fn();
console.log = jest.fn();
console.warn = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => {
  return {
    DynamoDBClient: jest.fn().mockImplementation(() => ({
      send: mockSend
    })),
    QueryCommand: jest.fn().mockImplementation(params => ({
      ...params,
      constructor: { name: 'QueryCommand' }
    })),
    DeleteItemCommand: jest.fn().mockImplementation(params => ({
      ...params,
      constructor: { name: 'DeleteItemCommand' }
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
process.env.TABLE_PREFIX = 'Test_';

let handler;

describe('delete_secret Lambda', () => {
  beforeAll(async () => {
    // Dynamically import the handler after mocks are set
    const module = await import('../delete_secret/index.js');
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
      return Promise.resolve({
        sub: 'user1',
        'cognito:groups': ['Users']
      });
    });
    mockParseBody.mockImplementation((body) => JSON.parse(body || '{}'));
    mockFormatResponse.mockImplementation((status, body) => ({ statusCode: status, body: JSON.stringify(body) }));
  });
  it('should delete a secret successfully', async () => {
    // Mock event
    const event = {
      headers: { Authorization: 'Bearer validToken' },
      body: JSON.stringify({
        site: 'example.com',
        subdirectory: 'work'
      })
    };

    // Mock query response with items
    mockSend.mockResolvedValueOnce({
      Items: [
        {
          user_id: { S: 'user1' },
          site: { S: 'example.com#work' },
          subdirectory: { S: 'work' }
        }
      ]
    });

    // Mock delete response
    mockSend.mockResolvedValueOnce({});

    // Call handler
    const response = await handler(event);

    // Verify response
    expect(response.statusCode).toBe(200);
    const responseBody = JSON.parse(response.body);
    expect(responseBody.message).toBe('Password deleted successfully');
    expect(responseBody.count).toBe(1);

    // Verify DynamoDB calls
    expect(mockSend).toHaveBeenCalledTimes(2);
    
    // Check query
    const queryCommand = mockSend.mock.calls[0][0];
    expect(queryCommand.constructor.name).toBe('QueryCommand');
    expect(queryCommand.TableName).toBe('Test_passwords');
    
    // Check delete
    const deleteCommand = mockSend.mock.calls[1][0];
    expect(deleteCommand.constructor.name).toBe('DeleteItemCommand');
    expect(deleteCommand.TableName).toBe('Test_passwords');
    expect(deleteCommand.Key.user_id.S).toBe('user1');
    expect(deleteCommand.Key.site.S).toBe('example.com#work');
  });

  it('should delete multiple secrets with the same site in a subdirectory', async () => {
    // Mock event
    const event = {
      headers: { Authorization: 'Bearer validToken' },
      body: JSON.stringify({
        site: 'example.com',
        subdirectory: 'work'
      })
    };

    // Mock query response with multiple items
    mockSend.mockResolvedValueOnce({
      Items: [
        {
          user_id: { S: 'user1' },
          site: { S: 'example.com#work1' },
          subdirectory: { S: 'work' }
        },
        {
          user_id: { S: 'user1' },
          site: { S: 'example.com#work2' },
          subdirectory: { S: 'work' }
        }
      ]
    });

    // Mock delete responses
    mockSend.mockResolvedValue({});

    // Call handler
    const response = await handler(event);

    // Verify response
    expect(response.statusCode).toBe(200);
    const responseBody = JSON.parse(response.body);
    expect(responseBody.message).toBe('Password deleted successfully');
    expect(responseBody.count).toBe(2);

    // Verify DynamoDB calls
    expect(mockSend).toHaveBeenCalledTimes(3); // 1 query + 2 deletes
  });

  it('should return 400 if site is missing', async () => {
    // Mock event with missing site
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
    expect(responseBody.message).toBe('Missing site parameter');
  });

  it('should return 401 for unauthorized access', async () => {
    // Mock event with invalid token
    const event = {
      headers: { Authorization: 'Bearer invalid' },
      body: JSON.stringify({
        site: 'example.com',
        subdirectory: 'work'
      })
    };

    // Call handler
    const response = await handler(event);

    // Verify response
    expect(response.statusCode).toBe(401);
    const responseBody = JSON.parse(response.body);
    expect(responseBody.message).toBe('Unauthorized');
  });

  it('should return 403 if trying to delete another user\'s secret', async () => {
    // Mock event with different user_id
    const event = {
      headers: { Authorization: 'Bearer validToken' },
      body: JSON.stringify({
        site: 'example.com',
        user_id: 'user2',
        subdirectory: 'work'
      })
    };

    // Call handler
    const response = await handler(event);

    // Verify response
    expect(response.statusCode).toBe(403);
    const responseBody = JSON.parse(response.body);
    expect(responseBody.message).toBe('You can only delete your own secrets');
  });

  it('should return 404 if no secrets are found', async () => {
    // Mock event
    const event = {
      headers: { Authorization: 'Bearer validToken' },
      body: JSON.stringify({
        site: 'nonexistent.com',
        subdirectory: 'work'
      })
    };

    // Mock empty query response
    mockSend.mockResolvedValueOnce({ Items: [] });

    // Call handler
    const response = await handler(event);

    // Verify response
    expect(response.statusCode).toBe(404);
    const responseBody = JSON.parse(response.body);
    expect(responseBody.message).toBe('Password not found');
  });

  it('should return 404 if no secrets match the subdirectory', async () => {
    // Mock event
    const event = {
      headers: { Authorization: 'Bearer validToken' },
      body: JSON.stringify({
        site: 'example.com',
        subdirectory: 'nonexistent'
      })
    };

    // Mock query response with items in different subdirectory
    mockSend.mockResolvedValueOnce({
      Items: [
        {
          user_id: { S: 'user1' },
          site: { S: 'example.com#work' },
          subdirectory: { S: 'work' }
        }
      ]
    });

    // Call handler
    const response = await handler(event);

    // Verify response
    expect(response.statusCode).toBe(404);
    const responseBody = JSON.parse(response.body);
    expect(responseBody.message).toBe('Password not found');
  });

  it('should return 500 for DynamoDB service errors', async () => {
    // Mock event
    const event = {
      headers: { Authorization: 'Bearer validToken' },
      body: JSON.stringify({
        site: 'example.com',
        subdirectory: 'work'
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
});
