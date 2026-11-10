# @graph-kit/testing

Graph-Kit testing utilities — mock driver, test helpers, matchers, and fixtures for unit testing Graph-Kit applications without a live graph database.

## Installation

```bash
pnpm add -D @graph-kit/testing @graph-kit/sdk
```

## Quick start

```ts
import { createMockDriver, graphMatchers, generateTestData } from '@graph-kit/testing';
import { GraphClient } from '@graph-kit/sdk';

const mock = createMockDriver();
const client = new GraphClient(mock, graph);

await client.create('User', { id: 'u1', name: 'Alice' });
const users = await client.findMany('User');

expect(mock.getQueryCount('MATCH (n:User) RETURN n')).toBeGreaterThan(0);
expect(graphMatchers.toBeValidNode(users[0], 'User').pass).toBe(true);
```

## API

### `MockDriverAdapter`

In-memory mock implementation of `DriverAdapter`. Methods:

| Method | Description |
|--------|-------------|
| `connect()` | Resolve (or throw if `setShouldThrow(true)` was called) |
| `disconnect()` | Clear stored data and query log |
| `runQuery(cypher, params?)` | Log the query and return a mock `QueryResult`; understands `MATCH (n:Label) RETURN n`, `CREATE`, and `DELETE`/`DETACH DELETE` patterns |
| `runInTransaction<T>(work)` / `runInReadTransaction<T>(work)` | Run work with a mock transaction context |
| `verifyConnectivity()` | Always return `true` |
| `getServerInfo()` | Return `{ address: 'mock://localhost', version: 'mock', protocol: 'mock' }` |
| `getCapabilities()` | Return static `DriverCapabilities` |
| `getQueryCount(cypher)` | Return how many times a cypher string was executed |
| `mockQuery(cypher, records, params?)` | Placeholder for mocking specific query responses |

### `createMockDriver()`

Factory returning a `MockDriverAdapter`.

### `graphMatchers`

Vitest/Jest-style matchers:

| Matcher | Description |
|---------|-------------|
| `toBeValidNode(node, expectedLabel?)` | Pass if `node` is a valid object, optionally with a matching `label` |
| `toHaveRelation(node, relationName)` | Pass if `node.relations[relationName]` exists |
| `toMatchCypherPattern(cypher, pattern)` | Pass if `cypher` matches the string/RegExp pattern |

Usage:

```ts
import { graphMatchers } from '@graph-kit/testing';
// extend expect or call directly
expect(graphMatchers.toBeValidNode(node, 'User').pass).toBe(true);
```

### Fixtures & data generators

| Function | Description |
|----------|-------------|
| `createTestFixtures()` | Return user/post/relation factories |
| `createUserFactory()` / `createPostFactory()` / `createRelationFactory()` | Factory functions producing indexed fixture records |
| `generateTestData({ count, factory })` | Generate an array of `count` items from a factory |
| `generateRandomString(length?)` | Random alphanumeric string |
| `generateRandomEmail()` | Random `example.com` email |
| `generateRandomDate(start?, end?)` | Random date in range |
| `generateRandomInt(min?, max?)` | Random integer |
| `generateRandomFloat(min?, max?)` | Random float |
| `generateRandomBoolean()` | Random boolean |
| `generateRandomUuid()` | Random UUID v4 |

## Re-exported types

The package re-exports core types from `@graph-kit/sdk`: `DriverAdapter`, `DriverCapabilities`, `GraphConfig`, `GraphSchemaRegistry`, `NodeConfig`, `PropertyConfig`, `QueryRecord`, `QueryResult`, `RelationConfig`, `TransactionContext`, `WhereCondition`.

## License

Apache 2.0
