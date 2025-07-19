/**
 * Test file for getAuthToken function in utils.js
 */

// Mock console methods to suppress output during tests
console.error = jest.fn();
console.log = jest.fn();
console.warn = jest.fn();

// Set environment variables
process.env.USER_POOL_ID = 'test-user-pool-id';
process.env.AWS_REGION = 'us-east-1';
process.env.COGNITO_REGION = 'us-east-1';

// Variable to hold the module we're testing
let utils;

describe('getAuthToken', () => {
  beforeAll(async () => {
    // Import the module after mocks are set up
    utils = await import('../layers/nodejs/utils.js');
  });

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
  });

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
