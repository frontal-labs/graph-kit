// @graph-om/testing/src/index.ts
// Testing utilities for Graph-OM - mock driver, test helpers, fixtures
// Barrel export - manually selects and re-exports public API

// Type re-exports from @graph-om/sdk
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
} from '@graph-om/sdk';
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
