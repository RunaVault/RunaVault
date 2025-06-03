/**
 * Test file for sanitizeObject function in utils.js
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

describe('sanitizeObject', () => {
  beforeAll(async () => {
    // Import the module after mocks are set up
    utils = await import('../layers/nodejs/utils.js');
  });

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
  });

  it('should sanitize strings in an object', () => {
    const obj = {
      name: '<b>Name</b>',
      description: 'Normal text',
      count: 123
    };
    
    const sanitized = utils.sanitizeObject(obj);
    
    expect(sanitized).toEqual({
      name: '&lt;b&gt;Name&lt;/b&gt;',
      description: 'Normal text',
      count: 123
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
    expect(utils.sanitizeObject(123)).toBe(123);
    expect(utils.sanitizeObject('string')).toBe('string');
    expect(utils.sanitizeObject(null)).toBe(null);
  });
});
