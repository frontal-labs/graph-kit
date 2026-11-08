# @graph-om/sdk

Graph-OM - Prisma-like developer experience for graph databases. The core SDK provides the schema DSL, Cypher query compiler, typed `GraphClient`, driver abstraction, configuration, migrations, observability, OpenTelemetry, GraphQL, batch operations, seeding, testing utilities, visualization, and auth.

## Installation

```bash
pnpm add @graph-om/sdk
```

Then install a driver adapter for your graph database:

```bash
# Neo4j
pnpm add @graph-om/neo4j

# Memgraph
pnpm add @graph-om/memgraph

# Kuzu (embedded)
pnpm add @graph-om/kuzu

# FalkorDB (Redis Stack / RedisGraph)
pnpm add @graph-om/falkordb
```

## Quick start

```ts
import { node, relation, string, GraphClient } from '@graph-om/sdk';
import { createNeo4jDriver } from '@graph-om/neo4j';

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
| `@graph-om/sdk` | Everything (schema, client, query, driver, config, migration, observability, otel, graphql, batch, seed, testing, visualization, auth, benchmark, types) |
| `@graph-om/sdk/schema` | Schema builders: `node`, `relation`, `schema`, `string`, `number`, `boolean`, `date`, `float`, `bigint`, `uuid`, `json`, `path`, `property`, `allShortestPaths`, `shortestPath`, parsers |
| `@graph-om/sdk/client` | `GraphClient`, `GraphTransaction`, value helpers |
| `@graph-om/sdk/errors` | `GraphError`, `graphErrors`, `hasCode`, `isFrontalError`, `getRootCause`, `mapDriverError`, `toPublic`, `errorResponse`, `formatError` |
| `@graph-om/sdk/query` | `QueryCompiler`, `createQueryCompiler`, `CompiledQuery` |
| `@graph-om/sdk/config` | `defineConfig`, `loadConfig`, `resolveConfig`, `getDefaultConfig`, `env` |
| `@graph-om/sdk/driver` | `DriverAdapter`, `DriverCapabilities`, `DriverConfig`, `createDriver`, `registerDriver`, `listDrivers`, `getDriverFactory`, config types (`Neo4jDriverConfig`, `MemgraphDriverConfig`, `FalkorDBDriverConfig`, `AnyDriverConfig`), `QueryResult`, `QueryRecord`, `TransactionContext` |
| `@graph-om/sdk/migration` | `MigrationRunner`, `createMigrationRunner`, `Migration`, `MigrationStatus`, `SchemaDiff`, `NodeDiff`, `PropertyDiff`, `RelationDiff`, `diffSchemas`, `generateMigrationFromDiff`, `createMigrationTemplate`, `generateVersion`, `loadMigrations` |
| `@graph-om/sdk/observability` | `QueryLogger`, `QueryProfiler`, `PrometheusMetricsCollector`, logging/tracing/metrics adapters |
| `@graph-om/sdk/otel` | OpenTelemetry instrumentation: `initializeOTel`, `TracedDriverAdapter`, `createOTelMiddleware`, tracers, meters, spans |
| `@graph-om/sdk/graphql` | `generateGraphQLSchema`, `generateResolvers`, Apollo/Yoga configs, scalars |
| `@graph-om/sdk/batch` | `BatchProcessor`, `createBatchProcessor`, bulk insert/update/delete/relate, CSV/JSON import/export |
| `@graph-om/sdk/seed` | `SeedManager`, `createSeedManager`, factories, CSV/JSON seed loading |
| `@graph-om/sdk/testing` | `MockDriverAdapter`, `createMockDriver`, `graphMatchers`, `createTestFixtures`, `generateTestData`, random generators |
| `@graph-om/sdk/visualization` | `generateERDiagram`, `generateDocumentation`, `exportSchema` |
| `@graph-om/sdk/auth` | `AuthManager`, `createAuthManager`, roles, permissions, sessions, tokens |
| `@graph-om/sdk/benchmark` | `BenchmarkRunner`, benchmark suites, CI regression detection |
| `@graph-om/sdk/schema/parser` | `parseSchemaFile`, `parseSchemaFromSource` |

## Core concepts

### Schema DSL

Define nodes and relations with type-safe builders:

```ts
import { node, relation, string, number, boolean, date, uuid, json } from '@graph-om/sdk/schema';

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
import { QueryCompiler } from '@graph-om/sdk/query';

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

Graph-OM abstracts database drivers behind `DriverAdapter`. Built-in drivers live in separate packages:

- `@graph-om/neo4j` — Neo4j (Bolt)
- `@graph-om/memgraph` — Memgraph (Bolt-compatible)
- `@graph-om/kuzu` — Kuzu (embedded)
- `@graph-om/falkordb` — FalkorDB (RedisGraph)

Register a custom driver:

```ts
import { registerDriver, createDriver } from '@graph-om/sdk/driver';

registerDriver('my-db', MyDriverAdapter);
const driver = createDriver({ type: 'my-db', ...config });
```

## Handling errors

Every failure graph-om throws is a typed `GraphError` with a stable `code`, so you can branch on it rather than on the message:

```ts
import { hasCode } from '@graph-om/sdk/errors';

try {
  await client.update('Person', { where: { id }, data });
} catch (error) {
  if (hasCode(error, 'record_not_found')) {
    // the record does not exist
  }
  throw error;
}
```

Driver errors keep the original error on `cause`. Before sending an error to a client, convert it with `toPublic`, so the client sees only the code and a fixed message. See [docs/errors.md](https://github.com/frontal-labs/graph-om/blob/main/docs/errors.md) for every code.

## Configuration

```ts
import { defineConfig, loadConfig } from '@graph-om/sdk/config';

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
import { QueryLogger, QueryProfiler, initializeOTel, TracedDriverAdapter } from '@graph-om/sdk';

const logger = createQueryLogger();
const profiler = createQueryProfiler();

initializeOTel({ serviceName: 'graph-om' });
const tracedDriver = new TracedDriverAdapter(driver);
```

## Testing

```ts
import { createMockDriver, graphMatchers, createTestFixtures, generateTestData } from '@graph-om/sdk/testing';

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
