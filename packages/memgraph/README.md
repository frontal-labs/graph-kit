# @graph-om/memgraph

Memgraph driver adapter for Graph-OM. Wraps the official [`neo4j-driver`](https://github.com/neo4j/neo4j-javascript-driver) and implements `DriverAdapter` from `@graph-om/sdk`. Memgraph is compatible with the Neo4j Bolt protocol, so this adapter uses the Neo4j JavaScript driver with Memgraph-appropriate settings.

## Installation

```bash
pnpm add @graph-om/memgraph @graph-om/sdk
```

`neo4j-driver` is a direct dependency and is installed automatically.

## Quick start

```ts
import { GraphClient } from '@graph-om/sdk';
import { createMemgraphDriver } from '@graph-om/memgraph';

const driver = createMemgraphDriver({
  uri: 'bolt://localhost:7687',
  username: 'neo4j',
  password: 'password',
  database: 'memgraph', // optional, default: 'memgraph'
});

await driver.connect();

const client = new GraphClient(driver, graph);
// ... use client

await driver.disconnect();
```

## API

### `createMemgraphDriver(config)`

Creates a `MemgraphDriverAdapter` instance.

```ts
export function createMemgraphDriver(config: MemgraphDriverConfig): MemgraphDriverAdapter;
```

### `MemgraphDriverAdapter`

Class implementing `DriverAdapter`. Methods:

| Method | Description |
|--------|-------------|
| `connect()` | Verify connectivity to the Memgraph instance |
| `disconnect()` | Close the underlying driver |
| `runQuery(cypher, params?)` | Execute a Cypher query against the configured database |
| `runInTransaction<T>(work)` | Execute work inside a write transaction |
| `runInReadTransaction<T>(work)` | Execute work inside a read transaction |
| `verifyConnectivity()` | Ping the server; return `true`/`false` |
| `getServerInfo()` | Query `CALL dbms.components()` and return `{ address, version, protocol }` |
| `getCapabilities()` | Return `DriverCapabilities` |

### `MemgraphDriverConfig`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `uri` | string | - | Memgraph Bolt connection URI |
| `username` | string | - | Username |
| `password` | string | - | Password |
| `database` | string | `'memgraph'` | Database name |
| `maxConnectionLifetime` | number | `3600000` | Max connection lifetime (ms) |
| `maxConnectionPoolSize` | number | `50` | Max pool size |
| `connectionAcquisitionTimeout` | number | `60000` | Connection acquisition timeout (ms) |
| `driverConfig` | object | `{}` | Additional Neo4j driver config |

The driver is constructed with `disableLosslessIntegers: true` for better TypeScript integration.

### Capabilities

```ts
{
  transactions: true,
  readReplicas: false,
  boltProtocol: true,
  httpProtocol: false,
  vectorSearch: false,
  fullTextSearch: false,
  geospatial: false,
  procedures: [],
}
```

## Re-exports

The package re-exports `neo4j` from `neo4j-driver` for advanced usage.

## License

Apache 2.0
