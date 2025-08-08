module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  testPathIgnorePatterns: ['<rootDir>/src/tests/integration/'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: {
        types: ['jest', 'node'],
      },
    }],
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/server.ts',
    '!src/tests/**',
    '!src/infrastructure/cache/**',
    '!src/infrastructure/database/DatabaseClient.ts',
    '!src/infrastructure/tracing/**',
    '!src/presentation/**',
    '!src/infrastructure/swagger/**',
    '!src/application/usecases/ListUsersUseCaseImpl.ts',
    '!src/infrastructure/repositories/EventSourcedUserRepository.ts',
    '!src/infrastructure/repositories/PrismaOutboxRepository.ts',
    '!src/domain/events/UserCreated.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html', 'cobertura', 'json-summary'],
  coverageThreshold: {
    global: {
      lines: 80,
      statements: 80,
    },
  },
  setupFilesAfterEnv: ['<rootDir>/src/tests/setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  reporters: [
    'default',
    ['jest-junit', {
      outputDirectory: '.',
      outputName: 'junit.xml',
      suiteName: 'Unit Tests',
      classNameTemplate: '{classname}',
      titleTemplate: '{title}',
    }],
  ],
};
