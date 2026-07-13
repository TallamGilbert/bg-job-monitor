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
};

export default config;
