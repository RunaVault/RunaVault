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

jest.mock('@aws-sdk/client-dynamodb', () => {
  const originalModule = jest.requireActual('@aws-sdk/client-dynamodb');
  
  return {
    __esModule: true,
    ...originalModule,
    DynamoDBClient: jest.fn().mockImplementation(() => ({
      send: mockSend
    })),
    QueryCommand: jest.fn().mockImplementation(params => ({
      ...params,
      constructor: { name: 'QueryCommand' }
    })),
    GetItemCommand: jest.fn().mockImplementation(params => ({
      ...params,
      constructor: { name: 'GetItemCommand' }
    }))
  };
});

// Mock utils module
jest.mock('/opt/utils.js', () => ({
  __esModule: true,
  getAuthToken: jest.fn((event) => event.headers?.Authorization?.replace('Bearer ', '') || ''),
  verifyToken: jest.fn((token) => {
    if (!token || token === 'invalid') return Promise.reject(new Error('Unauthorized'));
    return Promise.resolve({
      sub: 'user1',
      'cognito:groups': ['group1', 'group2']
    });
  }),
  formatResponse: jest.fn((status, body) => ({ statusCode: status, body: JSON.stringify(body) }))
}), { virtual: true });

// Set environment variables
process.env.TABLE_PREFIX = 'Test_';

let handler;
import { DynamoDBClient, QueryCommand, GetItemCommand } from '@aws-sdk/client-dynamodb';
import * as utils from '/opt/utils.js';

beforeAll(async () => {
  // Dynamically import the handler after mocks are set
  handler = (await import('../list_secrets/index.js')).handler;
});

describe('list_secrets Lambda', () => {
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
  });

  it('should list user secrets successfully', async () => {
    // Mock event
    const event = {
      headers: { Authorization: 'Bearer validToken' }
    };

    // Mock user secrets response
    mockSend.mockResolvedValueOnce({
      Items: [
        {
          user_id: { S: 'user1' },
          site: { S: 'example.com' },
          username: { S: 'testuser' },
          password: { S: JSON.stringify({ encryptedPassword: 'encrypted-data' }) },
          subdirectory: { S: 'default' },
          last_modified: { S: '2023-01-01T12:00:00Z' },
          tags: { SS: ['personal'] }
        }
      ]
    });

    // Mock group secrets response (empty for this test)
    mockSend.mockResolvedValueOnce({
      Items: []
    });

    // Mock group secrets response for group2 (empty)
    mockSend.mockResolvedValueOnce({
      Items: []
    });

    // Mock shared secrets response (empty for this test)
    mockSend.mockResolvedValueOnce({
      Items: []
    });

    // Call handler
    const response = await handler(event);

    // Verify response
    expect(response.statusCode).toBe(200);
    const responseBody = JSON.parse(response.body);
    expect(responseBody.secrets).toHaveLength(1);
    expect(responseBody.secrets[0]).toMatchObject({
      user_id: 'user1',
      site: 'example.com',
      username: 'testuser',
      subdirectory: 'default',
      owned_by_me: true,
      tags: ['personal']
    });

    // Verify DynamoDB calls
    expect(mockSend).toHaveBeenCalledTimes(4);
    
    // Check user secrets query
    const userSecretsQuery = mockSend.mock.calls[0][0];
    expect(userSecretsQuery.constructor.name).toBe('QueryCommand');
    expect(userSecretsQuery.TableName).toBe('Test_passwords');
    expect(userSecretsQuery.KeyConditionExpression).toBe('user_id = :user_id');
    expect(userSecretsQuery.ExpressionAttributeValues).toEqual({
      ':user_id': { S: 'user1' }
    });
  });

  it('should list group shared secrets', async () => {
    // Mock event
    const event = {
      headers: { Authorization: 'Bearer validToken' }
    };

    // Mock user secrets response (empty for this test)
    mockSend.mockResolvedValueOnce({
      Items: []
    });

    // Mock group secrets response for group1
    mockSend.mockResolvedValueOnce({
      Items: [
        {
          user_id: { S: 'owner1' },
          site: { S: 'group-site.com' },
          username: { S: 'groupuser' },
          password: { S: JSON.stringify({
            encryptedPassword: 'group-encrypted-data',
            sharedWith: {
              groups: [{ groupId: 'group1', encryptedPassword: 'group-specific-data' }]
            }
          }) },
          subdirectory: { S: 'shared' },
          shared_with_groups: { S: 'group1' }
        }
      ]
    });

    // Mock group secrets response for group2 (empty)
    mockSend.mockResolvedValueOnce({
      Items: []
    });

    // Mock shared secrets response (empty for this test)
    mockSend.mockResolvedValueOnce({
      Items: []
    });

    // Call handler
    const response = await handler(event);

    // Verify response
    expect(response.statusCode).toBe(200);
    const responseBody = JSON.parse(response.body);
    expect(responseBody.secrets).toHaveLength(1);
    expect(responseBody.secrets[0]).toMatchObject({
      user_id: 'owner1',
      site: 'group-site.com',
      username: 'groupuser',
      subdirectory: 'shared',
      owned_by_me: false,
      shared_with: {
        groups: ['group1']
      }
    });

    // Verify DynamoDB calls
    expect(mockSend).toHaveBeenCalledTimes(4);
    
    // Check group1 secrets query
    const groupSecretsQuery = mockSend.mock.calls[1][0];
    expect(groupSecretsQuery.constructor.name).toBe('QueryCommand');
    expect(groupSecretsQuery.TableName).toBe('Test_passwords');
    expect(groupSecretsQuery.IndexName).toBe('shared_with_groups-index');
    expect(groupSecretsQuery.KeyConditionExpression).toBe('shared_with_groups = :group_id');
    expect(groupSecretsQuery.ExpressionAttributeValues).toEqual({
      ':group_id': { S: 'group1' }
    });
  });

  it('should list directly shared secrets', async () => {
    // Mock event
    const event = {
      headers: { Authorization: 'Bearer validToken' }
    };

    // Mock user secrets response (empty for this test)
    mockSend.mockResolvedValueOnce({
      Items: []
    });

    // Mock group secrets responses (empty for both groups)
    mockSend.mockResolvedValueOnce({
      Items: []
    });
    mockSend.mockResolvedValueOnce({
      Items: []
    });

    // Mock shared secrets response
    mockSend.mockResolvedValueOnce({
      Items: [
        {
          user_id: { S: 'owner2' },
          site: { S: 'shared-site.com' },
          username: { S: 'shareduser' },
          password: { S: JSON.stringify({
            encryptedPassword: 'shared-encrypted-data',
            sharedWith: {
              users: [{ userId: 'user1', encryptedPassword: 'user-specific-data' }]
            }
          }) },
          subdirectory: { S: 'personal' },
          shared_with_users: { S: 'user1' }
        }
      ]
    });

    // Call handler
    const response = await handler(event);

    // Verify response
    expect(response.statusCode).toBe(200);
    const responseBody = JSON.parse(response.body);
    expect(responseBody.secrets).toHaveLength(1);
    expect(responseBody.secrets[0]).toMatchObject({
      user_id: 'owner2',
      site: 'shared-site.com',
      username: 'shareduser',
      subdirectory: 'personal',
      owned_by_me: false,
      shared_with: {
        users: ['user1']
      }
    });

    // Verify DynamoDB calls
    expect(mockSend).toHaveBeenCalledTimes(4);
    
    // Check shared secrets query
    const sharedSecretsQuery = mockSend.mock.calls[3][0];
    expect(sharedSecretsQuery.constructor.name).toBe('QueryCommand');
    expect(sharedSecretsQuery.TableName).toBe('Test_passwords');
    expect(sharedSecretsQuery.IndexName).toBe('shared_with_users-index');
    expect(sharedSecretsQuery.KeyConditionExpression).toBe('shared_with_users = :user_id');
    expect(sharedSecretsQuery.ExpressionAttributeValues).toEqual({
      ':user_id': { S: 'user1' }
    });
  });

  it('should combine and deduplicate secrets from multiple sources', async () => {
    // Mock event
    const event = {
      headers: { Authorization: 'Bearer validToken' }
    };

    // Mock user secrets response
    mockSend.mockResolvedValueOnce({
      Items: [
        {
          user_id: { S: 'user1' },
          site: { S: 'example.com' },
          username: { S: 'testuser' },
          password: { S: JSON.stringify({ encryptedPassword: 'encrypted-data' }) },
          subdirectory: { S: 'default' }
        }
      ]
    });

    // Mock group secrets response for group1
    mockSend.mockResolvedValueOnce({
      Items: [
        {
          user_id: { S: 'owner1' },
          site: { S: 'example.com' }, // Same site as user's own secret
          username: { S: 'groupuser' },
          password: { S: JSON.stringify({ encryptedPassword: 'group-data' }) },
          subdirectory: { S: 'shared' }, // Different subdirectory
          shared_with_groups: { S: 'group1' }
        }
      ]
    });

    // Mock group secrets response for group2 (empty)
    mockSend.mockResolvedValueOnce({
      Items: []
    });

    // Mock shared secrets response
    mockSend.mockResolvedValueOnce({
      Items: [
        {
          user_id: { S: 'owner1' },
          site: { S: 'example.com' }, // Same site
          username: { S: 'shareduser' },
          password: { S: JSON.stringify({ encryptedPassword: 'shared-data' }) },
          subdirectory: { S: 'shared' }, // Same subdirectory as group secret
          shared_with_users: { S: 'user1' }
        }
      ]
    });

    // Call handler
    const response = await handler(event);

    // Verify response
    expect(response.statusCode).toBe(200);
    const responseBody = JSON.parse(response.body);
    
    // Should have 2 unique secrets (one for default subdirectory, one for shared)
    expect(responseBody.secrets).toHaveLength(2);
    
    // Verify they're sorted by site
    expect(responseBody.secrets[0].site).toBe('example.com');
    expect(responseBody.secrets[1].site).toBe('example.com');
    
    // Verify different subdirectories
    const defaultSecret = responseBody.secrets.find(s => s.subdirectory === 'default');
    const sharedSecret = responseBody.secrets.find(s => s.subdirectory === 'shared');
    
    expect(defaultSecret).toBeDefined();
    expect(sharedSecret).toBeDefined();
    
    expect(defaultSecret.owned_by_me).toBe(true);
    expect(sharedSecret.owned_by_me).toBe(false);

    // Verify DynamoDB calls
    expect(mockSend).toHaveBeenCalledTimes(4);
  });

  it('should handle empty results', async () => {
    // Mock event
    const event = {
      headers: { Authorization: 'Bearer validToken' }
    };

    // Mock all responses as empty
    mockSend.mockResolvedValueOnce({ Items: [] }); // User secrets
    mockSend.mockResolvedValueOnce({ Items: [] }); // Group1 secrets
    mockSend.mockResolvedValueOnce({ Items: [] }); // Group2 secrets
    mockSend.mockResolvedValueOnce({ Items: [] }); // Shared secrets

    // Call handler
    const response = await handler(event);

    // Verify response
    expect(response.statusCode).toBe(200);
    const responseBody = JSON.parse(response.body);
    expect(responseBody.secrets).toHaveLength(0);

    // Verify DynamoDB calls
    expect(mockSend).toHaveBeenCalledTimes(4);
  });

  it('should handle malformed password data', async () => {
    // Mock event
    const event = {
      headers: { Authorization: 'Bearer validToken' }
    };

    // Mock user secrets with malformed password
    mockSend.mockResolvedValueOnce({
      Items: [
        {
          user_id: { S: 'user1' },
          site: { S: 'example.com' },
          username: { S: 'testuser' },
          password: { S: 'not-valid-json' }, // Malformed password
          subdirectory: { S: 'default' }
        }
      ]
    });

    // Mock other responses as empty
    mockSend.mockResolvedValueOnce({ Items: [] }); // Group1 secrets
    mockSend.mockResolvedValueOnce({ Items: [] }); // Group2 secrets
    mockSend.mockResolvedValueOnce({ Items: [] }); // Shared secrets

    // Call handler
    const response = await handler(event);

    // Verify response
    expect(response.statusCode).toBe(200);
    const responseBody = JSON.parse(response.body);
    expect(responseBody.secrets).toHaveLength(1);
    
    // Verify the password was handled gracefully
    expect(responseBody.secrets[0].password).toEqual({
      encryptedPassword: 'not-valid-json',
      sharedWith: { users: [], groups: [] }
    });

    // Verify DynamoDB calls
    expect(mockSend).toHaveBeenCalledTimes(4);
    
    // Verify console.error was called for the parsing error
    expect(console.error).toHaveBeenCalled();
  });

  it('should return 500 for unauthorized access', async () => {
    // Mock event with no token
    const event = {
      headers: {}
    };

    // Call handler
    const response = await handler(event);

    // Verify response
    expect(response.statusCode).toBe(500);
    const responseBody = JSON.parse(response.body);
    expect(responseBody).toEqual({ message: 'Unauthorized' });

    // Verify no DynamoDB calls
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('should return 500 for other errors', async () => {
    // Mock event
    const event = {
      headers: { Authorization: 'Bearer validToken' }
    };

    // Mock DynamoDB to throw an error
    mockSend.mockRejectedValueOnce(new Error('DynamoDB service error'));

    // Call handler
    const response = await handler(event);

    // Verify response
    expect(response.statusCode).toBe(500);
    const responseBody = JSON.parse(response.body);
    expect(responseBody).toEqual({ message: 'DynamoDB service error' });

    // Verify DynamoDB call was attempted
    expect(mockSend).toHaveBeenCalledTimes(1);
  });
});
