// Mock AWS SDK
const mockSend = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
  __esModule: true,
  DynamoDBClient: jest.fn().mockImplementation(() => ({
    send: mockSend
  })),
  PutItemCommand: jest.fn().mockImplementation(params => ({ params })),
  GetItemCommand: jest.fn().mockImplementation(params => ({ params }))
}));

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('mock-uuid-12345')
}));

// Mock utils module
jest.mock('/opt/utils.js', () => ({
  __esModule: true,
  getAuthToken: jest.fn((event) => event.headers?.Authorization?.replace('Bearer ', '') || ''),
  verifyToken: jest.fn((token) => Promise.resolve({ sub: 'user1' })),
  parseBody: jest.fn((body) => JSON.parse(body)),
  formatResponse: jest.fn((status, body) => ({ statusCode: status, body: JSON.stringify(body) }))
}), { virtual: true });

let handler;
import { DynamoDBClient, PutItemCommand, GetItemCommand } from '@aws-sdk/client-dynamodb';
import * as utils from '/opt/utils.js';

beforeAll(async () => {
  // Dynamically import the handler after mocks are set
  handler = (await import('../create_secret/index.js')).handler;
});

describe('create_secret Lambda', () => {
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Default mock implementation for successful case
    mockSend.mockImplementation((command) => {
      if (command instanceof GetItemCommand) {
        return Promise.resolve({
          Item: {
            site: { S: command.params.Key.site.S },
            username: { S: 'testuser' },
            password: { S: 'securepassword' },
            encrypted: { BOOL: true },
            shared_with_roles: { M: {} },
            shared_with_groups: { S: 'NONE' },
            shared_with_users: { S: 'NONE' },
            subdirectory: { S: 'default' },
            notes: { S: 'Test secret' },
            tags: { SS: ['work', 'important'] },
            favorite: { BOOL: false },
            version: { N: '1' },
            last_modified: { S: new Date().toISOString() },
            password_id: { S: 'mock-uuid-12345' }
          }
        });
      }
      return Promise.resolve({});
    });
  });

  test('should return 400 for missing required fields', async () => {
    const event = {
      headers: {
        Authorization: 'Bearer test-token'
      },
      body: JSON.stringify({
        username: 'testuser',
        password: 'securepassword'
      })
    };

    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Missing required parameters: site, username, and password are required');
  });

  test('should return 400 for invalid password format', async () => {
    const event = {
      headers: {
        Authorization: 'Bearer test-token'
      },
      body: JSON.stringify({
        site: 'example.com',
        username: 'testuser',
        password: '{invalid json}',
        encrypted: true,
        subdirectory: 'default'
      })
    };

    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Invalid password format');
  });

  // New test for notes length validation
  test('should return 400 when notes exceed maximum length', async () => {
    const longNotes = 'a'.repeat(501); // Create a string longer than 500 characters
    
    const event = {
      headers: {
        Authorization: 'Bearer test-token'
      },
      body: JSON.stringify({
        site: 'example.com',
        username: 'testuser',
        password: 'securepassword',
        notes: longNotes
      })
    };

    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Notes cannot exceed 500 characters');
  });

  // New test for item not found after creation
  test('should return 404 when item not found after creation', async () => {
    // Mock successful PutItemCommand but failed GetItemCommand
    mockSend.mockImplementation((command) => {
      if (command instanceof GetItemCommand) {
        return Promise.resolve({ Item: null }); // No item found
      }
      return Promise.resolve({});
    });

    const event = {
      headers: {
        Authorization: 'Bearer test-token'
      },
      body: JSON.stringify({
        site: 'example.com',
        username: 'testuser',
        password: 'securepassword',
        sharedWith: { 
          users: [], 
          groups: ['admin'],
          roles: {} 
        }
      })
    };

    const result = await handler(event);
    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body).message).toBe('Password not found after creation');
  });

  // New test for authentication error
  test('should return 401 for unauthorized access', async () => {
    // Mock verifyToken to reject with Unauthorized error
    utils.verifyToken.mockImplementationOnce(() => {
      return Promise.reject(new Error('Unauthorized: Invalid token'));
    });

    const event = {
      headers: {
        Authorization: 'Bearer invalid-token'
      },
      body: JSON.stringify({
        site: 'example.com',
        username: 'testuser',
        password: 'securepassword'
      })
    };

    const result = await handler(event);
    expect(result.statusCode).toBe(401);
    expect(JSON.parse(result.body).message).toBe('Unauthorized: Invalid token');
  });

  // New test for missing token
  test('should return 401 when no token is provided', async () => {
    // Mock getAuthToken to throw Unauthorized error
    utils.getAuthToken.mockImplementationOnce(() => {
      throw new Error('Unauthorized: No token provided');
    });

    const event = {
      headers: {},
      body: JSON.stringify({
        site: 'example.com',
        username: 'testuser',
        password: 'securepassword'
      })
    };

    const result = await handler(event);
    expect(result.statusCode).toBe(401);
    expect(JSON.parse(result.body).message).toBe('Unauthorized: No token provided');
  });

  // New test for parseBody error
  test('should return 500 when body parsing fails', async () => {
    // Mock parseBody to throw an error
    utils.parseBody.mockImplementationOnce(() => {
      throw new Error('Body is not valid JSON');
    });

    const event = {
      headers: {
        Authorization: 'Bearer test-token'
      },
      body: '{invalid json}'
    };

    const result = await handler(event);
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toBe('Body is not valid JSON');
  });
});