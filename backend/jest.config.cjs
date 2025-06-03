module.exports = {
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': ['babel-jest', { presets: ['@babel/preset-env'] }],
  },
  transformIgnorePatterns: ['<rootDir>/node_modules/'],
  moduleNameMapper: {
    '^@aws-sdk/client-dynamodb$': '<rootDir>/node_modules/@aws-sdk/client-dynamodb',
  },
  moduleDirectories: ['node_modules'],
  moduleFileExtensions: ['js', 'json', 'jsx', 'node'],
  testEnvironment: 'node',
  testEnvironmentOptions: {
    NODE_ENV: 'test'
  },
  // Set timeout for tests to avoid hanging
  testTimeout: 10000,
  // Force exit after tests complete
  // forceExit: true, // Temporarily disabled
  // Detect open handles (like unresolved promises)
  // detectOpenHandles: true, // Temporarily disabled
  verbose: true,
  maxWorkers: 1,
  // bail: 1, // Temporarily disabled
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    },
    './create_secret/index.js': {
      branches: 60,
      functions: 40,
      lines: 70,
      statements: 70
    },
    './add_user_to_groups/index.js': {
      branches: 60,
      functions: 40,
      lines: 70,
      statements: 70
    },
    './create_group/index.js': {
      branches: 60,
      functions: 40,
      lines: 70,
      statements: 70
    },
    './delete_group/index.js': {
      branches: 60,
      functions: 40,
      lines: 70,
      statements: 70
    },
    './create_user/index.js': {
      branches: 60,
      functions: 40,
      lines: 70,
      statements: 70
    }
  }
};
