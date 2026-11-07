# CLI Reference

The Graph-OM CLI (`@graph-om/cli`) provides `graph-om init` and `graph-om generate` commands.

## Installation

The CLI is installed as part of the Graph-OM monorepo:

```bash
pnpm install
```

Or for a standalone project:

```bash
pnpm add @graph-om/cli
```

## `graph-om init <directory>`

Scaffolds a new Graph-OM project.

```
graph-om init <directory> [--database <type>]
```

| Argument | Description | Default |
|---|---|---|
| `directory` | Project directory to create | `.` |

| Option | Description | Default |
|---|---|---|
| `--database` | Database type (neo4j) | `neo4j` |

**Generated files:**

- `package.json` — Project manifest with Graph-OM dependencies
- `tsconfig.json` — TypeScript configuration
- `src/schema.ts` — Graph schema definition
- `src/index.ts` — Application entrypoint
- `graph-om.config.ts` — Graph-OM configuration
- `.env.example` — Environment variable template

**Next steps after init:**

```bash
cd <directory>
pnpm install
cp .env.example .env
# Edit .env with your Neo4j credentials
npx tsx src/index.ts
```

## `graph-om generate`

Generates types and client code from your schema.

```
graph-om generate [--watch]
```

| Option | Description |
|---|---|
| `--watch` | Watch mode — regenerate on schema changes |

**Generated files:**

- `src/__generated__/types.ts` — TypeScript interfaces for your nodes
- `src/__generated__/client.ts` — Typed client factory
- `src/__generated__/index.ts` — Barrel export

**Example output:**

```ts
// src/__generated__/types.ts
export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
  relations: { ... };
}

// src/__generated__/client.ts
export async function createClient(config?: ClientConfig): Promise<GraphClient> {
  const driver = createNeo4jDriver({
    uri: config.uri || env.NEO4J_URI,
    username: config.username || env.NEO4J_USER,
    password: config.password || env.NEO4J_PASSWORD,
    database: config.database,
  });
  await driver.connect();
  const client = new GraphClient(driver, nodeConfigs);
  return client;
}
```

## Programmatic API

```ts
import { createProgram } from '@graph-om/cli';

const program = createProgram();
program.parse();
```
