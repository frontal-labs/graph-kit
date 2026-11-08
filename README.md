# GraphOM

![Frontal Banner](./banner.jpg)

**A modern, type-safe data access layer for graph databases.**

A schema-first TypeScript library for modelling, querying, and traversing graph data. It provides a fluent API, strong type inference, and a powerful query builder to make graph database development more predictable and enjoyable, without sacrificing the flexibility of native graph queries.

```
┌──────────────┐     ┌───────────────┐     ┌──────────────────┐
│  schema.ts   │────▶│  graph CLI    │────▶│ __generated__/   │
│ (node(),     │     │  generate     │     │  types.ts        │
│  relation()) │     └───────────────┘     │  client.ts       │
└──────────────┘                           │  zod.ts          │
       │                                   └──────────────────┘
       ▼                                            │
┌────────────────┐     ┌───────────────┐            ▼
│ @graph-om/sdk │────▶│ DriverAdapter │◀─── GraphClient(driver, nodes)
│ QueryCompiler  │     └───────────────┘
└────────────────┘            ▲
```

## Packages

| Package | Description |
| --- | --- |
| [`@graph-om/sdk`](./packages/sdk) | Schema DSL, Cypher query compiler, typed client, config system |
| [`@graph-om/cli`](./packages/cli) | `graph init` and `graph generate` codegen |
| [`@graph-om/zod`](./packages/zod) | Zod schema generation and validation from node configs |

## Quick start

```bash
# scaffold a project
npx @graph-om/cli init my-graph
cd my-graph
pnpm install          # or npm / yarn
cp .env.example .env  # set NEO4J_URI / NEO4J_USER / NEO4J_PASSWORD
npx graph generate
npx tsx src/index.ts
```

### Define a schema

```ts
// src/schema.ts
import { node, relation, schema as sch, string, boolean, date } from '@graph-om/sdk';

export const User = node('User')
  .add('id', string({ primary: true }))
  .add('name', string())
  .add('email', string({ unique: true }))
  .add('createdAt', date({ default: () => new Date() }))
  .add('posts', relation('POSTED', 'OUT', 'Post', { multiple: true }))
  .build();

export const Post = node('Post')
  .add('id', string({ primary: true }))
  .add('title', string())
  .add('published', boolean({ default: false }))
  .build();

export const graph = sch().add('User', User).add('Post', Post).build();
```

### Query the graph

```ts
import { GraphClient } from '@graph-om/sdk';
import { createNeo4jDriver } from '@graph-om/sdk/driver/neo4j';
import { graph } from './schema.js';

const driver = createNeo4jDriver({
  uri: process.env.NEO4J_URI!,
  username: process.env.NEO4J_USER!,
  password: process.env.NEO4J_PASSWORD!,
});
await driver.connect();
const client = new GraphClient(driver, graph);

const users = await client.findMany('User', {
  where: { name: { contains: 'Ali' } },
  orderBy: { name: 'asc' },
  limit: 10,
  include: { posts: true },
});

await client.upsert('User', {
  where: { id: 'u1' },
  create: { id: 'u1', name: 'Alice', email: 'alice@example.com' },
  update: { name: 'Alice A.' },
});

const hops = await client.traverse('User', 'POSTED', 'Post', {
  fromId: 'u1',
  minDepth: 1,
  maxDepth: 3,
});

await client.transaction(async (tx) => {
  await tx.create('Post', { data: { id: 'p1', title: 'Hello' } });
  await tx.raw('MATCH (a:User {id: $id}), (b:Post {id: $pid) CREATE (a)-[:POSTED]->(b)', {
    id: 'u1',
    pid: 'p1',
  });
});
```

### Validate with Zod

```ts
import { toCreateSchema, validateCreate } from '@graph-om/zod';
import { User } from './schema.js';

const result = validateCreate(User, { id: '1', name: 'Alice' });
if (!result.success) console.error(result.error.flatten());
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

`graph.config.ts` drives codegen:

```ts
import { defineConfig } from '@graph-om/sdk';

export default defineConfig({
  schema: './src/schema.ts',
  output: {
    directory: './src/__generated__',
    zod: true, // also emit zod.ts
  },
  driver: {
    type: 'neo4j',
    uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
    username: process.env.NEO4J_USER || 'neo4j',
    password: process.env.NEO4J_PASSWORD || 'password',
  },
  exclude: [],
});
```

## Development

```bash
pnpm install
pnpm build        # build all packages
pnpm test         # run all tests
pnpm lint         # biome + ultracite
pnpm typecheck    # tsc --noEmit across packages
pnpm format       # biome
```

### Integration tests

Unit tests run without a database. To run integration tests against a live Neo4j:

```bash
docker compose up -d
NEO4J_URI=bolt://localhost:7687 NEO4J_USER=neo4j NEO4J_PASSWORD=password pnpm test
```

## Releasing

This repo uses [changesets](https://github.com/changesets/changesets):

```bash
pnpm changeset    # describe the change
pnpm version      # bump versions + changelogs
pnpm release      # build + publish to npm
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

Apache 2.0
