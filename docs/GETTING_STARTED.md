# Graph-OM — Prisma-like DX for Graph Databases

Graph-OM is a TypeScript OGM (Object-Graph Mapper) for graph databases, starting with Neo4j. It provides a schema DSL, Cypher query compiler, type-safe client, and CLI tooling for init and code generation.

## Project Layout

```
graph-om/
├── cli/                  # @graph-om/cli — graph-om init / graph-om generate
├── packages/
│   ├── sdk/              # @graph-om/sdk — schema DSL, Cypher compiler, client, config, drivers
│   │   └── src/driver/   #   Neo4j, Memgraph, Kuzu and FalkorDB adapters
│   └── zod/              # @graph-om/zod — Zod validation integration
├── examples/
│   └── social-graph/     # End-to-end example app
├── docs/                 # This documentation
├── biome.json            # Biome formatter + lint config
├── turbo.json            # Turborepo pipeline config
├── tsconfig.base.json    # Base TypeScript config
└── pnpm-workspace.yaml   # pnpm workspace definition
```

## Getting Started

### Prerequisites

- Node.js >= 22
- pnpm 9 (corepack enable recommended)
- A running Neo4j instance (local or remote)

### Installation

```bash
git clone https://github.com/frontal-labs/graph-om.git
cd graph-om
pnpm install
pnpm build
```

### Initialize a New Project

```bash
npx @graph-om/cli init my-graph
cd my-graph
pnpm install
cp .env.example .env
# Edit .env with your Neo4j connection details
pnpm typecheck
npx tsx src/index.ts
```

## Configuration

### Environment Variables

All environment variables are validated through `@t3-oss/env-core` + zod in `packages/sdk/src/config/keys.ts`. Export `env` from `@graph-om/sdk`:

```ts
import { env } from '@graph-om/sdk';

console.log(env.NEO4J_URI);      // bolt://localhost:7687 (default)
console.log(env.NEO4J_USER);     // neo4j (default)
console.log(env.NEO4J_PASSWORD); // password (default)
console.log(env.NEO4J_DATABASE); // optional
console.log(env.GRAPH_OM_DEBUG);    // boolean, from GRAPH_OM_DEBUG=true
```

| Variable | Type | Default | Required |
|---|---|---|---|
| `NEO4J_URI` | string | `bolt://localhost:7687` | No |
| `NEO4J_USER` | string | `neo4j` | No |
| `NEO4J_PASSWORD` | string | `password` | No |
| `NEO4J_DATABASE` | string \| undefined | `undefined` | No |
| `GRAPH_OM_DEBUG` | boolean | `false` | No |

### graph-om.config.ts

```ts
import { defineConfig, env } from '@graph-om/sdk';

export default defineConfig({
  schema: './src/schema.ts',
  output: {
    directory: './src/__generated__',
    zod: false,
  },
  driver: {
    type: 'neo4j',
    uri: env.NEO4J_URI,
    username: env.NEO4J_USER,
    password: env.NEO4J_PASSWORD,
    database: env.NEO4J_DATABASE,
  },
  debug: env.GRAPH_OM_DEBUG,
  exclude: [],
});
```

## Schema DSL

Define your graph schema with the `node`, `defineRel`, and `schema` helpers:

```ts
import { node, defineRel, schema, string, number, date } from '@graph-om/sdk';

const User = node('User')
  .add('id', string({ primary: true }))
  .add('name', string())
  .add('email', string({ unique: true }))
  .add('createdAt', date({ default: () => new Date() }))
  .build();

const Post = node('Post')
  .add('id', string({ primary: true }))
  .add('title', string())
  .add('content', string())
  .build();

const AUTHORS = defineRel('AUTHORS', 'User', 'Post')
  .add('createdAt', date({ default: () => new Date() }))
  .build();

const graph = schema()
  .add('User', User)
  .add('Post', Post)
  .rel('AUTHORS', AUTHORS)
  .build();
```

## Client

```ts
import { GraphClient } from '@graph-om/sdk';
import { createNeo4jDriver } from '@graph-om/sdk/driver/neo4j';
import { graph } from './schema.js';

const driver = createNeo4jDriver({
  uri: env.NEO4J_URI,
  username: env.NEO4J_USER,
  password: env.NEO4J_PASSWORD,
});
await driver.connect();

const client = new GraphClient(driver, graph);

const users = await client.findMany('User', { limit: 10 });
await client.disconnect();
```

## CLI

### `graph-om init <directory>`

Scaffolds a new Graph-OM project with schema, config, env example, and entrypoint.

### `graph-om generate`

Generates types and client code from your schema. Supports `--watch` for auto-regeneration.

## Development

```bash
pnpm install        # Install all workspace dependencies
pnpm build          # Build all packages
pnpm dev            # Watch mode for all packages
pnpm test           # Run all tests
pnpm test:ci        # Run tests (verbose CI reporter)
pnpm test:coverage  # Run tests with coverage
pnpm lint           # Biome + Ultracite check
pnpm format         # Biome + Ultracite fix
pnpm format:check   # Biome + Ultracite check
pnpm typecheck      # TypeScript typecheck across all packages
pnpm clean          # Clean all dist, .turbo, coverage dirs
```

## Releasing

This project uses [changesets](https://github.com/changesets/changesets) for versioning and publishing.

```bash
pnpm changeset   # Add a changeset for user-facing changes
pnpm version     # Version packages based on changesets
pnpm release     # Build and publish
```

## License

Apache-2.0
