# @graph-om/kuzu

Kuzu driver adapter for Graph-OM. [Kuzu](https://kuzudb.com/) is an embedded graph database. This adapter loads the `kuzu` Node.js bindings dynamically and implements `DriverAdapter` from `@graph-om/sdk` over Kuzu's embedded mode (network mode is not yet implemented).

## Installation

```bash
pnpm add @graph-om/kuzu @graph-om/sdk
```

The `kuzu` package is a peer-style optional dependency — install it explicitly:

```bash
pnpm add kuzu
```

## Quick start

```ts
import { GraphClient } from '@graph-om/sdk';
import { createKuzuDriver } from '@graph-om/kuzu';

const driver = createKuzuDriver({
  type: 'kuzu',
  databasePath: './data/kuzu.db',
  uri: '',              // required by base DriverConfig; unused in embedded mode
  username: '',         // unused in embedded mode
  password: '',         // unused in embedded mode
});

await driver.connect();

const client = new GraphClient(driver, graph);
// ... use client

await driver.disconnect();
```

## API

### `createKuzuDriver(config)`

Creates a `KuzuDriverAdapter` instance.

```ts
export function createKuzuDriver(config: KuzuConfig): KuzuDriverAdapter;
```

### `KuzuDriverAdapter`

Class implementing `DriverAdapter`. Methods:

| Method | Description |
|--------|-------------|
| `connect()` | Open the Kuzu database at `databasePath` and connect |
| `disconnect()` | Close the connection and database |
| `runQuery(cypher, params?)` | Execute a Cypher query and return a normalized `QueryResult` |
| `runInTransaction<T>(work)` | Execute work in a transaction (Kuzu auto-commits each query) |
| `runInReadTransaction<T>(work)` | Same as `runInTransaction` in embedded mode |
| `verifyConnectivity()` | Run `MATCH (n) RETURN count(n) LIMIT 1`; return `true`/`false` |
| `getServerInfo()` | Return `{ address: databasePath, version: 'unknown', protocol: 'embedded' }` |
| `getCapabilities()` | Return `DriverCapabilities` |

### `KuzuConfig`

Extends `DriverConfig`. Fields:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `'kuzu'` | yes | Driver discriminator |
| `databasePath` | string | yes | Filesystem path to the Kuzu database file |
| `uri` | string | yes | Required by `DriverConfig`; unused in embedded mode |
| `username` | string | yes | Unused in embedded mode |
| `password` | string | yes | Unused in embedded mode |

### Capabilities

```ts
{
  transactions: true,
  readReplicas: false,
  boltProtocol: false,
  httpProtocol: false,
  vectorSearch: false,
  fullTextSearch: false,
  geospatial: false,
  procedures: [],
}
```

## Notes

- Kuzu network mode is not yet implemented — use embedded mode with `databasePath`.
- Kuzu auto-commits each query, so explicit commit/rollback is a no-op in this adapter.
- Nested transactions are not supported.

## License

Apache 2.0
