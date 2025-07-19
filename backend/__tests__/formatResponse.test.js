/**
 * Test file for formatResponse function in utils.js
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

describe('formatResponse', () => {
  beforeAll(async () => {
    // Import the module after mocks are set up
    utils = await import('../layers/nodejs/utils.js');
  });

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
  });

  it('should format a response with default headers', () => {
    const response = utils.formatResponse(200, { message: 'Success' });
    
    expect(response).toEqual({
      statusCode: 200,
      body: JSON.stringify({ message: 'Success' }),
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  });
  
  it('should format a response with custom headers', () => {
    const response = utils.formatResponse(201, { message: 'Created' }, { 'Custom-Header': 'Value' });
    
    expect(response).toEqual({
      statusCode: 201,
      body: JSON.stringify({ message: 'Created' }),
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Custom-Header': 'Value'
      }
    });
  });
});
