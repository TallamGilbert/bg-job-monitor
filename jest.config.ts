import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests', '<rootDir>/packages'],
  testMatch: ['**/*.test.ts'],
  moduleNameMapper: {
    '^@bg-jobs/shared$': '<rootDir>/packages/shared/src',
    '^@bg-jobs/store$': '<rootDir>/packages/store/src',
  },
  // Allow importing from packages directly
  moduleDirectories: ['node_modules', 'packages'],
  // Run tests serially
  maxWorkers: 1,
  // Timeout for tests
  testTimeout: 30000,
};

export default config;
