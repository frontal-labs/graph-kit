# @graph-kit/sdk

Graph-Kit - Prisma-like developer experience for graph databases. The core SDK provides the schema DSL, Cypher query compiler, typed `GraphClient`, driver abstraction, configuration, migrations, observability, OpenTelemetry, GraphQL, batch operations, seeding, testing utilities, visualization, and auth.

## Installation

```bash
pnpm add @graph-kit/sdk
```

Drivers ship with the SDK. Import the one for your database from its subpath:

```ts
import { createNeo4jDriver } from '@graph-kit/sdk/driver/neo4j';        // Neo4j
import { createMemgraphDriver } from '@graph-kit/sdk/driver/memgraph';  // Memgraph
import { createKuzuDriverAsync } from '@graph-kit/sdk/driver';          // Kuzu (embedded), async factory
import { createFalkorDBDriver } from '@graph-kit/sdk/driver/falkordb';  // FalkorDB
```

## Quick start

```ts
import { node, relation, string, GraphClient } from '@graph-kit/sdk';
import { createNeo4jDriver } from '@graph-kit/sdk/driver/neo4j';

// 1. Define your schema with the DSL
export const User = node('User')
  .add('id', string({ primary: true }))
  .add('name', string())
  .add('email', string())
  .add('posts', relation('POSTED', 'OUT', 'Post', { multiple: true }))
  .build();

export const Post = node('Post')
  .add('id', string({ primary: true }))
  .add('title', string())
  .add('content', string())
  .build();

const graph = { User, Post };

// 2. Connect a driver
const driver = createNeo4jDriver({
  uri: 'bolt://localhost:7687',
  username: 'neo4j',
  password: 'password',
  database: 'neo4j',
});
await driver.connect();

// 3. Create the typed client
const client = new GraphClient(driver, graph);

// 4. Use it
await client.create('User', { id: 'u1', name: 'Alice', email: 'alice@example.com' });
const users = await client.findMany('User', { include: { posts: true } });

await driver.disconnect();
```

## Subpath exports

| Export | Contents |
|--------|----------|
| `@graph-kit/sdk` | Everything (schema, client, query, driver, config, migration, observability, otel, graphql, batch, seed, testing, visualization, auth, benchmark, types) |
| `@graph-kit/sdk/schema` | Schema builders: `node`, `relation`, `schema`, `string`, `number`, `boolean`, `date`, `float`, `bigint`, `uuid`, `json`, `path`, `property`, `allShortestPaths`, `shortestPath`, parsers |
| `@graph-kit/sdk/client` | `GraphClient`, `GraphTransaction`, value helpers |
| `@graph-kit/sdk/errors` | `GraphError`, `raiseGraphError`, `hasCode`, `isRetryable`, `isFrontalError`, `getRootCause`, `mapDriverError`, `toPublic`, `errorResponse`, `formatError` |
| `@graph-kit/sdk/query` | `QueryCompiler`, `createQueryCompiler`, `CompiledQuery` |
| `@graph-kit/sdk/config` | `defineConfig`, `loadConfig`, `resolveConfig`, `getDefaultConfig`, `env` |
| `@graph-kit/sdk/driver` | `DriverAdapter`, `DriverCapabilities`, `DriverConfig`, `createDriver`, `registerDriver`, `listDrivers`, `getDriverFactory`, config types (`Neo4jDriverConfig`, `MemgraphDriverConfig`, `FalkorDBDriverConfig`, `AnyDriverConfig`), `QueryResult`, `QueryRecord`, `TransactionContext` |
| `@graph-kit/sdk/migration` | `MigrationRunner`, `createMigrationRunner`, `Migration`, `MigrationStatus`, `SchemaDiff`, `NodeDiff`, `PropertyDiff`, `RelationDiff`, `diffSchemas`, `generateMigrationFromDiff`, `createMigrationTemplate`, `generateVersion`, `loadMigrations` |
| `@graph-kit/sdk/observability` | `QueryLogger`, `QueryProfiler`, `PrometheusMetricsCollector`, logging/tracing/metrics adapters |
| `@graph-kit/sdk/otel` | OpenTelemetry instrumentation: `initializeOTel`, `TracedDriverAdapter`, `createOTelMiddleware`, tracers, meters, spans |
| `@graph-kit/sdk/graphql` | `generateGraphQLSchema`, `generateResolvers`, Apollo/Yoga configs, scalars |
| `@graph-kit/sdk/batch` | `BatchProcessor`, `createBatchProcessor`, bulk insert/update/delete/relate, CSV/JSON import/export |
| `@graph-kit/sdk/seed` | `SeedManager`, `createSeedManager`, factories, CSV/JSON seed loading |
| `@graph-kit/sdk/testing` | `MockDriverAdapter`, `createMockDriver`, `graphMatchers`, `createTestFixtures`, `generateTestData`, random generators |
| `@graph-kit/sdk/visualization` | `generateERDiagram`, `generateDocumentation`, `exportSchema` |
| `@graph-kit/sdk/auth` | `AuthManager`, `createAuthManager`, roles, permissions, sessions, tokens |
| `@graph-kit/sdk/benchmark` | `BenchmarkRunner`, benchmark suites, CI regression detection |
| `@graph-kit/sdk/schema/parser` | `parseSchemaFile`, `parseSchemaFromSource` |

## Core concepts

### Schema DSL

Define nodes and relations with type-safe builders:

```ts
import { node, relation, string, number, boolean, date, uuid, json } from '@graph-kit/sdk/schema';

const User = node('User')
  .add('id', uuid({ primary: true }))
  .add('name', string())
  .add('age', number())
  .add('active', boolean({ default: true }))
  .add('createdAt', date())
  .add('metadata', json({ nullable: true }))
  .add('friends', relation('KNOWS', 'OUT', 'User', { multiple: true }))
  .build();
```

Property options include `primary`, `unique`, `nullable`, `array`, `default`, and `index`.

### Query compiler

Compile Cypher programmatically:

```ts
import { QueryCompiler } from '@graph-kit/sdk/query';

const compiler = new QueryCompiler();
const { cypher, params } = compiler.compileFind('User', { where: { name: 'Alice' } });
// cypher => "MATCH (n:User) WHERE n.name = $param0 RETURN n"
// params => { param0: 'Alice' }
```

### GraphClient

Typed CRUD over your graph:

```ts
const client = new GraphClient(driver, graph);

await client.create('User', data);
await client.findUnique('User', { where: { id: 'u1' } });
await client.findMany('User', { where: {}, include: { posts: true }, orderBy: { name: 'asc' }, take: 10, skip: 0 });
await client.update('User', { where: { id: 'u1' }, data: { name: 'Alice Smith' } });
await client.delete('User', { where: { id: 'u1' } });
await client.upsert('User', { where: { id: 'u1' }, create: {}, update: {} });
```

### Driver abstraction

Graph-Kit abstracts database drivers behind `DriverAdapter`. Built-in drivers live under the SDK's `driver` subpaths:

- `@graph-kit/sdk/driver/neo4j` — Neo4j (Bolt)
- `@graph-kit/sdk/driver/memgraph` — Memgraph (Bolt-compatible)
- `@graph-kit/sdk/driver` (`createKuzuDriverAsync`) — Kuzu (embedded)
- `@graph-kit/sdk/driver/falkordb` — FalkorDB (RedisGraph)

Register a custom driver:

```ts
import { registerDriver, createDriver } from '@graph-kit/sdk/driver';

registerDriver('my-db', MyDriverAdapter);
const driver = createDriver({ type: 'my-db', ...config });
```

## Handling errors

Every failure graph-kit throws is a typed `GraphError` with a stable `code`, so you can branch on it rather than on the message:

```ts
import { hasCode } from '@graph-kit/sdk/errors';

try {
  await client.update('Person', { where: { id }, data });
} catch (error) {
  if (hasCode(error, 'record_not_found')) {
    // the record does not exist
  }
  throw error;
}
```

Driver errors keep the original error on `cause`. Before sending an error to a client, convert it with `toPublic`, so the client sees only the code and a fixed message. See [docs/errors.md](https://github.com/frontal-labs/graph-kit/blob/main/docs/errors.md) for every code.

## Configuration

```ts
import { defineConfig, loadConfig } from '@graph-kit/sdk/config';

const config = defineConfig({
  database: {
    type: 'neo4j',
    uri: 'bolt://localhost:7687',
    username: 'neo4j',
    password: 'password',
  },
});

await loadConfig(config);
```

Environment-driven config is supported via `env` (powered by `@t3-oss/env-core`).

## Observability & OpenTelemetry

```ts
import { QueryLogger, QueryProfiler, initializeOTel, TracedDriverAdapter } from '@graph-kit/sdk';

const logger = createQueryLogger();
const profiler = createQueryProfiler();

initializeOTel({ serviceName: 'graph-kit' });
const tracedDriver = new TracedDriverAdapter(driver);
```

## Testing

```ts
import { createMockDriver, graphMatchers, createTestFixtures, generateTestData } from '@graph-kit/sdk/testing';

const mock = createMockDriver();
const client = new GraphClient(mock, graph);
// assert with graphMatchers.toBeValidNode, toHaveRelation, toMatchCypherPattern
```

## Scripts

```bash
pnpm build      # tsup build
pnpm dev        # tsup --watch
pnpm test       # vitest run
pnpm typecheck  # tsc --noEmit
```

Integration tests against Neo4j require `NEO4J_URI`, `NEO4J_USER`, and `NEO4J_PASSWORD`.

## License

Apache 2.0
