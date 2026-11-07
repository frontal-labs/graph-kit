# @graph-om/core

The heart of Graph-OM: schema DSL, Cypher query compiler, typed client, and config system.

```ts
import { node, relation, schema, string, GraphClient } from '@graph-om/core';

export const User = node('User')
  .add('id', string({ primary: true }))
  .add('name', string())
  .add('posts', relation('POSTED', 'OUT', 'Post', { multiple: true }))
  .build();

const client = new GraphClient(driver, { User });
const users = await client.findMany('User', { include: { posts: true } });
```

## Subpath exports

- `@graph-om/core` — everything
- `@graph-om/core/schema` — schema builders only
- `@graph-om/core/client` — `GraphClient` / `GraphTransaction`
- `@graph-om/core/query` — `QueryCompiler`
- `@graph-om/core/config` — `defineConfig` / `loadConfig`

## Testing

```bash
pnpm test
```

The query compiler is fully unit-tested. For integration tests against Neo4j, set `NEO4J_URI`, `NEO4J_USER`, and `NEO4J_PASSWORD`.

## License

MIT
