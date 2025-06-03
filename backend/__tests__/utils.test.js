/**
 * Test file for utils.js Lambda layer
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
  decode: mockDecodeFn,          // For named import: import { decode } from 'jsonwebtoken'
  verify: mockVerifyFn,          // For named import: import { verify } from 'jsonwebtoken'
  default: {                     // For default import: import jwt from 'jsonwebtoken'
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
// e.g. mockDecodeFn.mockReturnValue(...)
// e.g. mockClientGetSigningKeyFn.mockImplementation(...)

// Import the module we're testing
let utils;

describe('Utils Module', () => {
  beforeAll(async () => {
    // Import the module after mocks are set up
    utils = await import('../layers/nodejs/utils.js');
  });

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
  });

  describe('verifyToken', () => {
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
      const result = await utils.verifyToken('valid-token');

      // Verify results
      expect(mockDecodeFn).toHaveBeenCalledWith('valid-token', { complete: true });
      expect(mockClientGetSigningKeyFn).toHaveBeenCalledWith('test-kid', expect.any(Function));
      expect(mockVerifyFn).toHaveBeenCalledWith('valid-token', 'test-public-key', { algorithms: ['RS256'] });
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
        header: {} // No kid
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
      await expect(utils.verifyToken('valid-token')).rejects.toThrow('Failed to get signing key');
      expect(mockClientGetSigningKeyFn).toHaveBeenCalledWith('test-kid', expect.any(Function));
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
      await expect(utils.verifyToken('valid-token')).rejects.toThrow('Token verification failed');
      expect(mockClientGetSigningKeyFn).toHaveBeenCalledWith('test-kid', expect.any(Function));
    });
  });

  describe('formatResponse', () => {
    it('should format a response with default headers', () => {
      const response = utils.formatResponse(200, { message: 'Success' });
      expect(response).toEqual({
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message: 'Success' })
      });
    });

    it('should format a response with custom headers', () => {
      const customHeaders = { 'X-Custom-Header': 'value' };
      const response = utils.formatResponse(200, { message: 'Success' }, customHeaders);
      expect(response).toEqual({
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
          'X-Custom-Header': 'value'
        },
        body: JSON.stringify({ message: 'Success' })
      });
    });
  });

  describe('sanitizeString', () => {
    it('should sanitize HTML special characters', () => {
      const input = '<script>alert("XSS");</script>';
      const expected = '&lt;script&gt;alert(&quot;XSS&quot;);&lt;/script&gt;';
      expect(utils.sanitizeString(input)).toBe(expected);
    });

    it('should return non-string values as is', () => {
      expect(utils.sanitizeString(123)).toBe(123);
      expect(utils.sanitizeString(null)).toBeNull();
      expect(utils.sanitizeString(undefined)).toBeUndefined();
      const obj = { a: 1 };
      expect(utils.sanitizeString(obj)).toBe(obj);
    });
  });

  describe('sanitizeObject', () => {
    it('should sanitize strings in an object', () => {
      const obj = {
        name: '<b>Name</b>',
        description: '<p>Description</p>'
      };
      const sanitized = utils.sanitizeObject(obj);
      expect(sanitized).toEqual({
        name: '&lt;b&gt;Name&lt;/b&gt;',
        description: '&lt;p&gt;Description&lt;/p&gt;'
      });
    });

    it('should sanitize nested objects', () => {
      const obj = {
        user: {
          name: '<b>Name</b>',
          profile: {
            bio: '<script>alert("XSS");</script>'
          }
        },
        stats: [1, 2, '<i>3</i>']
      };
      const sanitized = utils.sanitizeObject(obj);
      expect(sanitized).toEqual({
        user: {
          name: '&lt;b&gt;Name&lt;/b&gt;',
          profile: {
            bio: '&lt;script&gt;alert(&quot;XSS&quot;);&lt;/script&gt;'
          }
        },
        stats: [1, 2, '<i>3</i>']
      });
    });

    it('should return non-object values as is', () => {
      expect(utils.sanitizeObject('string')).toBe('string');
      expect(utils.sanitizeObject(123)).toBe(123);
      expect(utils.sanitizeObject(null)).toBeNull();
    });

    it('should handle arrays with objects and strings', () => {
      const arr = [
        { text: '<p>Hello</p>' },
        '<em>World</em>',
        [{ deep: '<a>link</a>' }]
      ];
      const sanitized = utils.sanitizeObject(arr);
      expect(sanitized).toEqual([
        { text: '&lt;p&gt;Hello&lt;/p&gt;' },
        '<em>World</em>',
        [{ deep: '&lt;a&gt;link&lt;/a&gt;' }]
      ]);
    });
  });

  describe('parseBody', () => {
    it('should parse a valid JSON body', () => {
      const eventBody = JSON.stringify({ key: 'value' });
      const result = utils.parseBody(eventBody);
      expect(result).toEqual({ key: 'value' });
    });
    
    it('should throw error for missing body', () => {
      expect(() => utils.parseBody(null)).toThrow('No body provided');
      expect(() => utils.parseBody(undefined)).toThrow('No body provided');
      expect(() => utils.parseBody('')).toThrow('No body provided');
    });

    it('should throw error for invalid JSON', () => {
      const eventBody = 'not-valid-json';
      expect(() => utils.parseBody(eventBody)).toThrow('Body is not valid JSON');
    });
  });

  describe('getAuthToken', () => {
    it('should extract token from Authorization header', () => {
      const event = {
        headers: {
          Authorization: 'Bearer test-token'
        }
      };
      const token = utils.getAuthToken(event);
      expect(token).toBe('test-token');
    });

    it('should extract token from lowercase authorization header', () => {
      const event = {
        headers: {
          authorization: 'Bearer test-token'
        }
      };
      const token = utils.getAuthToken(event);
      expect(token).toBe('test-token');
    });

    it('should throw an error if no Authorization header is present', () => {
      const event = {
        headers: {}
      };
      expect(() => utils.getAuthToken(event)).toThrow('Unauthorized: No token provided');
    });

    it('should throw an error if no headers', () => {
      const event = {};
      expect(() => utils.getAuthToken(event)).toThrow('Unauthorized: No token provided');
    });

    it('should throw an error if Authorization header does not start with Bearer', () => {
      const event = {
        headers: {
          Authorization: 'test-token'
        }
      };
      expect(() => utils.getAuthToken(event)).toThrow('Unauthorized: No token provided');
    });
  });
});