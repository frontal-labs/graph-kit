# @graph-om/neo4j

Neo4j driver adapter for Graph-OM. Wraps the official [`neo4j-driver`](https://github.com/neo4j/neo4j-javascript-driver) and implements `DriverAdapter` from `@graph-om/sdk`. Provides connection pooling, transactions, result normalization, and server introspection for Neo4j.

## Installation

```bash
pnpm add @graph-om/neo4j @graph-om/sdk
```

`neo4j-driver` is a direct dependency and is installed automatically.

## Quick start

```ts
import { GraphClient } from '@graph-om/sdk';
import { createNeo4jDriver } from '@graph-om/neo4j';

const driver = createNeo4jDriver({
  uri: 'bolt://localhost:7687',
  username: 'neo4j',
  password: 'password',
  database: 'neo4j', // optional
});

await driver.connect();

const client = new GraphClient(driver, graph);
// ... use client

await driver.disconnect();
```

## API

### `createNeo4jDriver(config)`

Creates a `Neo4jDriverAdapter` instance.

```ts
export function createNeo4jDriver(config: Neo4jConfig): Neo4jDriverAdapter;
```

### `Neo4jDriverAdapter`

Class implementing `DriverAdapter`. Methods:

| Method | Description |
|--------|-------------|
| `connect()` | Establish the driver connection and verify server info |
| `disconnect()` | Close the driver |
| `getDriver()` | Return the underlying `neo4j-driver` `Driver` instance |
| `session(config?)` | Open a Neo4j session with optional database/mode/bookmarks/fetchSize |
| `runQuery(cypher, params?, sessionConfig?)` | Execute a Cypher query and return a normalized `QueryResult` |
| `runInTransaction<T>(work)` | Execute work inside a write transaction (`executeWrite`) |
| `runInReadTransaction<T>(work)` | Execute work inside a read transaction (`executeRead`) |
| `verifyConnectivity()` | Check whether the driver can reach the server |
| `getServerInfo()` | Return `{ address, version, protocol }` |
| `getCapabilities()` | Return `DriverCapabilities` |

### `Neo4jConfig`

Extends `DriverConfig`. Fields:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `'neo4j'` | yes | Driver discriminator |
| `uri` | string | yes | Bolt connection URI |
| `username` | string | yes | Neo4j username |
| `password` | string | yes | Neo4j password |
| `database` | string | no | Target database (default: `neo4j`) |
| `maxConnectionLifetime` | number | no | Max connection lifetime (ms, default `3 * 60 * 60 * 1000`) |
| `maxTransactionRetryTime` | number | no | Max transaction retry time (ms, default `30 * 1000`) |
| `connectionAcquisitionTimeout` | number | no | Connection acquisition timeout (ms, default `10 * 1000`) |

Additional Neo4j driver pooling defaults: `maxConnectionPoolSize: 50`, `connectionTimeout: 10 * 1000`.

### `Neo4jSessionConfig`

| Field | Type | Description |
|-------|------|-------------|
| `database` | string | Session database override |
| `mode` | `'READ' \| 'WRITE'` | Default access mode |
| `bookmarks` | string \| string[] | Bookmarks for causal consistency |
| `fetchSize` | number | Result fetch size |

### Capabilities

```ts
{
  transactions: true,
  readReplicas: true,
  boltProtocol: true,
  httpProtocol: false,
  vectorSearch: true,   // Neo4j 5.11+
  fullTextSearch: true,
  geospatial: true,
  procedures: ['apoc', 'gds', 'n10s'],
}
```

## Result normalization

`runQuery` returns a normalized `QueryResult` with `records`, `summary` (query, counters, notifications, timings, database), and `keys`. Counters include nodes/relationships created/deleted, properties set, labels/indexes/constraints added/removed.

## Re-exports

The package re-exports `Driver`, `ManagedTransaction`, `Session` and the `neo4j` factory from `neo4j-driver` for advanced usage.

```ts
import { neo4j, type Driver, type Session } from '@graph-om/neo4j';
```

## License

Apache 2.0
