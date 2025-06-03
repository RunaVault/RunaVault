// Mock AWS SDK
const mockSend = jest.fn().mockResolvedValue({});

jest.mock('@aws-sdk/client-dynamodb', () => ({
  __esModule: true,
  DynamoDBClient: jest.fn().mockImplementation(() => ({
    send: mockSend
  })),
  PutItemCommand: jest.fn().mockImplementation(params => ({ params })),
  GetItemCommand: jest.fn().mockImplementation(params => ({ params }))
}));

// Mock utils module
jest.mock('/opt/utils.js', () => ({
  __esModule: true,
  getAuthToken: jest.fn((event) => event.headers?.Authorization?.replace('Bearer ', '') || ''),
  verifyToken: jest.fn((token) => token ? { sub: 'user1' } : Promise.reject(new Error('Unauthorized'))),
  parseBody: jest.fn((body) => JSON.parse(body)),
  formatResponse: jest.fn((status, body) => ({ statusCode: status, body: JSON.stringify(body) }))
}), { virtual: true });

let handler;
import { DynamoDBClient, PutItemCommand, GetItemCommand } from '@aws-sdk/client-dynamodb';
import * as utils from '/opt/utils.js';

let mockDynamoDB;

beforeAll(async () => {
  // Dynamically import the handler after mocks are set
  handler = (await import('../create_secret/index.js')).handler;
});

describe('create_secret Lambda', () => {
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    mockSend.mockImplementation((command) => {
      if (command.params && command.params.Key) {
        // This is a GetItemCommand
        const siteKey = command.params.Key.site.S;
        return Promise.resolve({
          Item: {
            site: { S: siteKey },
            username: { S: 'testuser' },
            password: { S: 'securepassword' },
            encrypted: { BOOL: true },
            shared_with_roles: { M: {} },
            subdirectory: { S: 'default' },
            notes: { S: 'Test secret' },
            tags: { SS: ['work', 'important'] },
            favorite: { BOOL: false },
            version: { N: '1' },
            last_modified: { S: new Date().toISOString() },
            password_id: { S: 'any-password-id' }
          }
        });
      }
      // Otherwise, it's a PutItemCommand or something else
      return Promise.resolve({});
    });
  });

  test('should create secret with plain string password', async () => {
    const event = {
      headers: {
        Authorization: 'Bearer test-token'
      },
      body: JSON.stringify({
        site: 'example.com',
        username: 'testuser',
        password: 'securepassword',
        encrypted: true,
        sharedWith: { users: [], groups: [], roles: {} },
        subdirectory: 'default',
        notes: 'Test secret',
        tags: ['work', 'important'],
        favorite: false,
        version: 1
      })
    };

    const result = await handler(event);
    expect(result.statusCode).toBe(200);
  });

  test('should create secret with JSON string password', async () => {
    const event = {
      headers: {
        Authorization: 'Bearer test-token'
      },
      body: JSON.stringify({
        site: 'example.com',
        username: 'testuser',
        password: '{"encryptedPassword":"securepassword","sharedWith":{"users":[],"groups":[],"roles":{}}}',
        encrypted: true,
        sharedWith: { users: [], groups: [], roles: {} },
        subdirectory: 'default',
        notes: 'Test secret',
        tags: ['work', 'important'],
        favorite: false,
        version: 1
      })
    };

    const result = await handler(event);
    expect(result.statusCode).toBe(200);
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
});
