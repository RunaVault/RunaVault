/**
 * Test file for verifyToken function in utils.js
 */

// Mock console methods to suppress output during tests
console.error = jest.fn();
console.log = jest.fn();
console.warn = jest.fn();

// Set environment variables
process.env.TABLE_PREFIX = 'Test_';
process.env.USER_POOL_ID = 'test-user-pool-id';
process.env.AWS_REGION = 'us-east-1';
process.env.COGNITO_REGION = 'us-east-1';

// Create mock functions for JWT
const mockDecodeFn = jest.fn();
const mockVerifyFn = jest.fn();

// Create mock functions/objects for JWKS-RSA
const mockClientGetSigningKeyFn = jest.fn(); // This will be the mock for client.getSigningKey
const mockJwksClientInstance = {
  getSigningKey: mockClientGetSigningKeyFn
};
const mockJwksRsaConstructor = jest.fn(() => mockJwksClientInstance);

// Setup mocks
jest.mock('jsonwebtoken', () => ({
  __esModule: true,
  decode: mockDecodeFn,
  verify: mockVerifyFn,
  default: { // For default import: import jwt from 'jsonwebtoken'
    decode: mockDecodeFn,
    verify: mockVerifyFn,
  }
}), { virtual: true });

jest.mock('jwks-rsa', () => ({
  __esModule: true,
  default: mockJwksRsaConstructor, // Assuming jwks-rsa is imported as a default export
  JwksClient: mockJwksRsaConstructor // Also mock JwksClient if it's a named export used like new JwksClient()
}), { virtual: true });

// For tests, use mockDecodeFn, mockVerifyFn, and mockClientGetSigningKeyFn

// Import the module we're testing
let utils;

const MOCK_JWT_WITH_KID = "eyJhbGciOiJSUzI1NiIsImtpZCI6InRlc3Qta2lkIn0.eyJzdWIiOiJ0ZXN0LXVzZXIifQ.dummySignature";

describe('verifyToken', () => {
  beforeAll(async () => {
    // Import the module after mocks are set up
    utils = await import('../layers/nodejs/utils.js');
  });

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
  });

  it('should verify a valid token', async () => {
    // Mock JWT decode
    mockDecodeFn.mockReturnValue({
      header: { kid: 'test-kid' }
    });

    // Mock getSigningKey to call callback with a signing key
    mockClientGetSigningKeyFn.mockImplementation((kid, callback) => {
      callback(null, { getPublicKey: () => 'test-public-key' });
    });

    // Mock JWT verify
    const mockDecodedToken = { sub: 'user1', 'cognito:groups': ['Users'] };
    mockVerifyFn.mockReturnValue(mockDecodedToken);

    // Call verifyToken
    const result = await utils.verifyToken(MOCK_JWT_WITH_KID);

    // Verify results
    expect(mockDecodeFn).toHaveBeenCalledWith(MOCK_JWT_WITH_KID, { complete: true });
    expect(mockVerifyFn).toHaveBeenCalledWith(MOCK_JWT_WITH_KID, 'test-public-key', { algorithms: ['RS256'] });
    expect(result).toEqual(mockDecodedToken);
  });

  it('should reject an invalid token', async () => {
    // Mock JWT decode to throw an error
    mockDecodeFn.mockImplementation(() => {
      throw new Error('Invalid token');
    });

    // Call verifyToken and expect it to reject
    await expect(utils.verifyToken('invalid-token')).rejects.toThrow('Invalid token');
  });

  it('should reject if token has no kid', async () => {
    // Mock JWT decode to return a token with no kid
    mockDecodeFn.mockReturnValue({
      header: {}
    });

    // Call verifyToken and expect it to throw
    await expect(utils.verifyToken('invalid-token')).rejects.toThrow('Invalid token: Missing key ID');
  });
  
  it('should reject if getSigningKey fails', async () => {
    // Mock JWT decode
    mockDecodeFn.mockReturnValue({
      header: { kid: 'test-kid' }
    });
    
    // Mock getSigningKey to fail
    mockClientGetSigningKeyFn.mockImplementation((kid, callback) => {
      callback(new Error('Failed to get signing key'));
    });

    // Call verifyToken and expect it to reject
    await expect(utils.verifyToken(MOCK_JWT_WITH_KID)).rejects.toThrow('Failed to get signing key');
  });

  it('should reject if JWT verification fails', async () => {
    // Mock JWT decode
    mockDecodeFn.mockReturnValue({
      header: { kid: 'test-kid' }
    });
    
    // Mock getSigningKey
    mockClientGetSigningKeyFn.mockImplementation((kid, callback) => {
      callback(null, { getPublicKey: () => 'test-public-key' });
    });

    // Mock JWT verify to throw an error
    mockVerifyFn.mockImplementation(() => {
      throw new Error('Token verification failed');
    });

    // Call verifyToken and expect it to reject
    await expect(utils.verifyToken(MOCK_JWT_WITH_KID)).rejects.toThrow('Token verification failed');
  });
});
