# @graph-om/memgraph

Memgraph driver adapter for Graph-OM. Wraps the official [`neo4j-driver`](https://github.com/neo4j/neo4j-javascript-driver) and implements `DriverAdapter` from `@graph-om/core` with Memgraph-specific configuration.

Memgraph is compatible with the Neo4j Bolt protocol, so this adapter uses the Neo4j JavaScript driver with appropriate settings.

```ts
import { GraphClient } from '@graph-om/core';
import { createMemgraphDriver } from '@graph-om/memgraph';

const driver = createMemgraphDriver({
  uri: 'bolt://localhost:7687',
  username: 'neo4j',
  password: 'password',
  database: 'memgraph', // optional
});
await driver.connect();

const client = new GraphClient(driver, graph);
```

## Features

- Connection pooling with configurable timeouts
- `runQuery`, `runInTransaction` (`executeWrite`), `runInReadTransaction` (`executeRead`)
- Result normalization (records, counters, notifications, timings)
- Uses `disableLosslessIntegers: true` for better TypeScript integration

## Configuration

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `uri` | string | - | Memgraph connection URI |
| `username` | string | - | Username |
| `password` | string | - | Password |
| `database` | string | `'memgraph'` | Database name |
| `maxConnectionLifetime` | number | `3600000` | Max connection lifetime (ms) |
| `maxConnectionPoolSize` | number | `50` | Max pool size |
| `connectionAcquisitionTimeout` | number | `60000` | Connection acquisition timeout (ms) |
| `driverConfig` | object | `{}` | Additional Neo4j driver config |

## License

MIT