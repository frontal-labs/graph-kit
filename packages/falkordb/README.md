# @graph-om/falkordb

FalkorDB driver adapter for Graph-OM. FalkorDB (Redis Graph / Redis Stack) exposes graph queries through the Redis `GRAPH.QUERY` / `GRAPH.RO_QUERY` commands. This adapter wraps [`redis`](https://github.com/redis/node-redis) and implements `DriverAdapter` from `@graph-om/sdk`.

## Installation

```bash
pnpm add @graph-om/falkordb @graph-om/sdk
```

`redis` is a direct dependency and is installed automatically.

## Quick start

```ts
import { GraphClient } from '@graph-om/sdk';
import { createFalkorDBDriver } from '@graph-om/falkordb';

const driver = createFalkorDBDriver({
  host: 'localhost',     // default: 'localhost'
  port: 6379,            // default: 6379
  password: '',          // optional
  database: 0,           // optional, default: 0
  graphName: 'default',  // optional, default: 'default'
});

await driver.connect();

const client = new GraphClient(driver, graph);
// ... use client

await driver.disconnect();
```

## API

### `createFalkorDBDriver(config)`

Creates a `FalkorDBDriverAdapter` instance.

```ts
export function createFalkorDBDriver(config: FalkorDBDriverConfig): FalkorDBDriverAdapter;
```

### `FalkorDBDriverAdapter`

Class implementing `DriverAdapter`. Methods:

| Method | Description |
|--------|-------------|
| `connect()` | Connect the Redis client and ping the server |
| `disconnect()` | Quit the Redis client |
| `runQuery(cypher, params?)` | Execute `GRAPH.QUERY <graph> "<cypher>"` (falls back to `GRAPH.RO_QUERY`) |
| `runInTransaction<T>(work)` | Execute work in a single-query context (FalkorDB has no multi-statement transactions) |
| `runInReadTransaction<T>(work)` | Same as `runInTransaction` |
| `verifyConnectivity()` | Ping the server; return `true`/`false` |
| `getServerInfo()` | Run `INFO server` and return `{ address, version, protocol: 'redis' }` |
| `getCapabilities()` | Return `DriverCapabilities` |

### `FalkorDBDriverConfig`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `host` | string | `'localhost'` | Redis/FalkorDB host |
| `port` | number | `6379` | Redis/FalkorDB port |
| `password` | string | - | Redis password |
| `database` | number | `0` | Redis database index |
| `graphName` | string | `'default'` | FalkorDB graph name |

Parameters are flattened as `key, JSON.stringify(value)` pairs and sent with `GRAPH.QUERY`. Result rows are mapped with header-based keys and values are parsed (JSON where possible).

### Capabilities

```ts
{
  transactions: false,
  readReplicas: false,
  boltProtocol: false,
  httpProtocol: false,
  vectorSearch: false,
  fullTextSearch: false,
  geospatial: false,
  procedures: [],
}
```

## License

Apache 2.0
