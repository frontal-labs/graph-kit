# @graph-om/neo4j

Neo4j driver adapter for Graph-OM. Wraps the official [`neo4j-driver`](https://github.com/neo4j/neo4j-javascript-driver) and implements `DriverAdapter` from `@graph-om/core`.

```ts
import { GraphClient } from '@graph-om/core';
import { createNeo4jDriver } from '@graph-om/neo4j';

const driver = createNeo4jDriver({
  uri: 'bolt://localhost:7687',
  username: 'neo4j',
  password: 'password',
  database: 'neo4j', // optional
});
await driver.connect();

const client = new GraphClient(driver, graph);
```

## Features

- Connection pooling with configurable timeouts
- `runQuery`, `runInTransaction` (`executeWrite`), `runInReadTransaction` (`executeRead`)
- Result normalization (records, counters, notifications, timings)

## License

MIT
