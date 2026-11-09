// @graph-kit/testing/src/index.ts
// Testing utilities for Graph-Kit - mock driver, test helpers, fixtures
// Barrel export - manually selects and re-exports public API

// Type re-exports from @graph-kit/sdk
export type {
  DriverAdapter,
  DriverCapabilities,
  GraphConfig,
  GraphSchemaRegistry,
  NodeConfig,
  PropertyConfig,
  QueryRecord,
  QueryResult,
  RelationConfig,
  TransactionContext,
  WhereCondition,
} from '@graph-kit/sdk';
// Driver domain
export { createMockDriver, MockDriverAdapter } from './driver/index';

// Fixtures domain
export type { TestFixture } from './fixtures/index';
export { createTestFixtures, generateTestData } from './fixtures/index';

// Generators domain
export {
  generateRandomBoolean,
  generateRandomDate,
  generateRandomEmail,
  generateRandomFloat,
  generateRandomInt,
  generateRandomString,
  generateRandomUuid,
} from './generators/index';
// Matchers domain
export { graphMatchers } from './matchers/index';
