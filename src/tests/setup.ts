// Test setup file for Jest
process.env.NODE_ENV = 'test';

// Mock environment variables for tests
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';
process.env.REDIS_URL = 'redis://localhost:6379';

// Global test utilities
global.console = {
  ...console,
  // Uncomment to ignore specific console methods while running tests
  // log: jest.fn(),
  // warn: jest.fn(),
  // error: jest.fn(),
};
