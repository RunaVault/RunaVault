/**
 * Test file for sanitizeString function in utils.js
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

describe('sanitizeString', () => {
  beforeAll(async () => {
    // Import the module after mocks are set up
    utils = await import('../layers/nodejs/utils.js');
  });

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
  });

  it('should sanitize HTML special characters', () => {
    const sanitized = utils.sanitizeString('<script>alert("XSS Attack");</script>');
    
    expect(sanitized).toBe('&lt;script&gt;alert(&quot;XSS Attack&quot;);&lt;/script&gt;');
  });
  
  it('should return non-string values as is', () => {
    expect(utils.sanitizeString(123)).toBe(123);
    expect(utils.sanitizeString(null)).toBe(null);
    expect(utils.sanitizeString(undefined)).toBe(undefined);
  });
});
