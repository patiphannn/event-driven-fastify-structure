module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/integration/**/*.test.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: {
        types: ['jest', 'node'],
      },
    }],
  },
  setupFilesAfterEnv: ['<rootDir>/src/tests/setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testTimeout: 60000, // Longer timeout for integration tests
  maxWorkers: 1, // Run integration tests sequentially to avoid conflicts
  forceExit: true, // Force exit to prevent hanging
  detectOpenHandles: true, // Detect open handles to help with debugging
  reporters: [
    'default',
    ['jest-junit', {
      outputDirectory: '.',
      outputName: 'junit.xml',
      suiteName: 'Integration Tests',
      classNameTemplate: '{classname}',
      titleTemplate: '{title}',
    }],
  ],
};
