/**
 * Test file for parseBody function in utils.js
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

// Import the module we're testing
let utils;

describe('parseBody', () => {
  beforeAll(async () => {
    // Import the module after mocks are set up
    utils = await import('../layers/nodejs/utils.js');
  });

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
  });

  it('should parse a valid JSON body', () => {
    const validJson = JSON.stringify({ key: 'value' });
    
    const result = utils.parseBody(validJson);
    
    expect(result).toEqual({ key: 'value' });
  });
  
  it('should throw an error for missing body', () => {
    expect(() => utils.parseBody(null)).toThrow('No body provided');
    expect(() => utils.parseBody(undefined)).toThrow('No body provided');
    expect(() => utils.parseBody('')).toThrow('No body provided');
  });

  it('should throw an error for invalid JSON', () => {
    const invalidJson = 'not-valid-json';
    
    expect(() => utils.parseBody(invalidJson)).toThrow('Body is not valid JSON');
  });
});
