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

jest.mock('/opt/utils.js', () => ({
  __esModule: true,
  formatResponse: jest.fn((status, body) => ({ statusCode: status, body: JSON.stringify(body) }))
}), { virtual: true });

// Mock the shared authorization layer. Identity now comes from the context
// the dual-mode Lambda authorizer attaches, not from a per-handler JWT
// re-verification - see backend/authorizer/index.js.
const mockGetAuthContext = jest.fn();
const mockRequireScope = jest.fn(() => true);
const mockIsSecretPathAllowed = jest.fn(() => true);
const mockToSecretPath = jest.fn((site, subdirectory) =>
  subdirectory && subdirectory !== 'default' ? `${subdirectory}/${site}` : site
);

jest.mock('/opt/authz.js', () => ({
  __esModule: true,
  getAuthContext: mockGetAuthContext,
  requireScope: mockRequireScope,
  isSecretPathAllowed: mockIsSecretPathAllowed,
  toSecretPath: mockToSecretPath,
}), { virtual: true });

// Set environment variables
process.env.TABLE_PREFIX = 'Test_';

let handler;
import { DynamoDBClient, QueryCommand, GetItemCommand } from '@aws-sdk/client-dynamodb';

beforeAll(async () => {
  // Dynamically import the handler after mocks are set
  handler = (await import('../list_secrets/index.js')).handler;
});

const cognitoCtx = (overrides = {}) => ({
  authType: 'cognito',
  userId: 'user1',
  groups: ['group1', 'group2'],
  scopes: [],
  allowedSecretPaths: [],
  tokenId: null,
  ...overrides,
});

describe('list_secrets Lambda', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSend.mockReset();
    mockRequireScope.mockReturnValue(true);
    mockIsSecretPathAllowed.mockReturnValue(true);
    mockGetAuthContext.mockReturnValue(cognitoCtx());
  });

  it('should list user secrets successfully', async () => {
    const event = { headers: { Authorization: 'Bearer validToken' } };

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
    mockSend.mockResolvedValueOnce({ Items: [] });
    mockSend.mockResolvedValueOnce({ Items: [] });
    mockSend.mockResolvedValueOnce({ Items: [] });

    const response = await handler(event);

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

    expect(mockSend).toHaveBeenCalledTimes(4);

    const userSecretsQuery = mockSend.mock.calls[0][0];
    expect(userSecretsQuery.constructor.name).toBe('QueryCommand');
    expect(userSecretsQuery.TableName).toBe('Test_passwords');
    expect(userSecretsQuery.KeyConditionExpression).toBe('user_id = :user_id');
    expect(userSecretsQuery.ExpressionAttributeValues).toEqual({
      ':user_id': { S: 'user1' }
    });
  });

  it('should list group shared secrets', async () => {
    const event = { headers: { Authorization: 'Bearer validToken' } };

    mockSend.mockResolvedValueOnce({ Items: [] });
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
    mockSend.mockResolvedValueOnce({ Items: [] });
    mockSend.mockResolvedValueOnce({ Items: [] });

    const response = await handler(event);

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

    expect(mockSend).toHaveBeenCalledTimes(4);

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
    const event = { headers: { Authorization: 'Bearer validToken' } };

    mockSend.mockResolvedValueOnce({ Items: [] });
    mockSend.mockResolvedValueOnce({ Items: [] });
    mockSend.mockResolvedValueOnce({ Items: [] });
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

    const response = await handler(event);

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

    expect(mockSend).toHaveBeenCalledTimes(4);

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
    const event = { headers: { Authorization: 'Bearer validToken' } };

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
    mockSend.mockResolvedValueOnce({
      Items: [
        {
          user_id: { S: 'owner1' },
          site: { S: 'example.com' },
          username: { S: 'groupuser' },
          password: { S: JSON.stringify({ encryptedPassword: 'group-data' }) },
          subdirectory: { S: 'shared' },
          shared_with_groups: { S: 'group1' }
        }
      ]
    });
    mockSend.mockResolvedValueOnce({ Items: [] });
    mockSend.mockResolvedValueOnce({
      Items: [
        {
          user_id: { S: 'owner1' },
          site: { S: 'example.com' },
          username: { S: 'shareduser' },
          password: { S: JSON.stringify({ encryptedPassword: 'shared-data' }) },
          subdirectory: { S: 'shared' },
          shared_with_users: { S: 'user1' }
        }
      ]
    });

    const response = await handler(event);

    expect(response.statusCode).toBe(200);
    const responseBody = JSON.parse(response.body);

    expect(responseBody.secrets).toHaveLength(2);
    expect(responseBody.secrets[0].site).toBe('example.com');
    expect(responseBody.secrets[1].site).toBe('example.com');

    const defaultSecret = responseBody.secrets.find(s => s.subdirectory === 'default');
    const sharedSecret = responseBody.secrets.find(s => s.subdirectory === 'shared');

    expect(defaultSecret).toBeDefined();
    expect(sharedSecret).toBeDefined();
    expect(defaultSecret.owned_by_me).toBe(true);
    expect(sharedSecret.owned_by_me).toBe(false);

    expect(mockSend).toHaveBeenCalledTimes(4);
  });

  it('should handle empty results', async () => {
    const event = { headers: { Authorization: 'Bearer validToken' } };

    mockSend.mockResolvedValueOnce({ Items: [] });
    mockSend.mockResolvedValueOnce({ Items: [] });
    mockSend.mockResolvedValueOnce({ Items: [] });
    mockSend.mockResolvedValueOnce({ Items: [] });

    const response = await handler(event);

    expect(response.statusCode).toBe(200);
    const responseBody = JSON.parse(response.body);
    expect(responseBody.secrets).toHaveLength(0);
    expect(mockSend).toHaveBeenCalledTimes(4);
  });

  it('should handle malformed password data', async () => {
    const event = { headers: { Authorization: 'Bearer validToken' } };

    mockSend.mockResolvedValueOnce({
      Items: [
        {
          user_id: { S: 'user1' },
          site: { S: 'example.com' },
          username: { S: 'testuser' },
          password: { S: 'not-valid-json' },
          subdirectory: { S: 'default' }
        }
      ]
    });
    mockSend.mockResolvedValueOnce({ Items: [] });
    mockSend.mockResolvedValueOnce({ Items: [] });
    mockSend.mockResolvedValueOnce({ Items: [] });

    const response = await handler(event);

    expect(response.statusCode).toBe(200);
    const responseBody = JSON.parse(response.body);
    expect(responseBody.secrets).toHaveLength(1);
    expect(responseBody.secrets[0].password).toEqual({
      encryptedPassword: 'not-valid-json',
      sharedWith: { users: [], groups: [] }
    });

    expect(mockSend).toHaveBeenCalledTimes(4);
    expect(console.error).toHaveBeenCalled();
  });

  it('should return 400 when the authorizer context has no userId', async () => {
    mockGetAuthContext.mockReturnValue(cognitoCtx({ userId: null }));
    const event = { headers: {} };

    const response = await handler(event);

    expect(response.statusCode).toBe(400);
    const responseBody = JSON.parse(response.body);
    expect(responseBody).toEqual({ message: 'Invalid token: Missing userId' });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('should return 403 when the caller lacks the secrets:read scope', async () => {
    mockGetAuthContext.mockReturnValue(cognitoCtx({ authType: 'machine', scopes: [] }));
    mockRequireScope.mockReturnValue(false);
    const event = { headers: { Authorization: 'Bearer rv_live_x' } };

    const response = await handler(event);

    expect(response.statusCode).toBe(403);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('should filter results by allowed secret paths for machine tokens', async () => {
    mockGetAuthContext.mockReturnValue(
      cognitoCtx({ authType: 'machine', groups: [], allowedSecretPaths: ['production/*'] })
    );
    mockIsSecretPathAllowed.mockImplementation((ctx, path) => path.startsWith('production/'));

    mockSend.mockResolvedValueOnce({
      Items: [
        {
          user_id: { S: 'user1' },
          site: { S: 'db' },
          username: { S: 'u' },
          password: { S: JSON.stringify({ encryptedPassword: 'e1' }) },
          subdirectory: { S: 'production' }
        },
        {
          user_id: { S: 'user1' },
          site: { S: 'db' },
          username: { S: 'u' },
          password: { S: JSON.stringify({ encryptedPassword: 'e2' }) },
          subdirectory: { S: 'development' }
        }
      ]
    });
    mockSend.mockResolvedValueOnce({ Items: [] });

    const event = { headers: { Authorization: 'Bearer rv_live_x' } };
    const response = await handler(event);

    expect(response.statusCode).toBe(200);
    const responseBody = JSON.parse(response.body);
    expect(responseBody.secrets).toHaveLength(1);
    expect(responseBody.secrets[0].subdirectory).toBe('production');
  });

  it('should return 500 for other errors', async () => {
    const event = { headers: { Authorization: 'Bearer validToken' } };

    mockSend.mockRejectedValueOnce(new Error('DynamoDB service error'));

    const response = await handler(event);

    expect(response.statusCode).toBe(500);
    const responseBody = JSON.parse(response.body);
    expect(responseBody).toEqual({ message: 'DynamoDB service error' });
    expect(mockSend).toHaveBeenCalledTimes(1);
  });
});
