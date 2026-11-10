# Environment Variables

Graph-Kit uses [@t3-oss/env-core](https://env.t3.gg/) with [zod](https://zod.dev/) to validate and type environment variables. All env access goes through the `env` export from `@graph-kit/sdk`.

## Schema Definition

The env schema lives in `packages/sdk/src/config/keys.ts`:

```ts
import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

export const env = createEnv({
  server: {
    NEO4J_URI: z.string().default('bolt://localhost:7687'),
    NEO4J_USER: z.string().default('neo4j'),
    NEO4J_PASSWORD: z.string().default('password'),
    NEO4J_DATABASE: z.string().optional(),
    GRAPH_KIT_DEBUG: z.string().optional().transform((val) => val === 'true'),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
```

## Variable Reference

| Variable | Type | Default | Description |
|---|---|---|---|
| `NEO4J_URI` | string | `bolt://localhost:7687` | Neo4j connection URI |
| `NEO4J_USER` | string | `neo4j` | Neo4j username |
| `NEO4J_PASSWORD` | string | `password` | Neo4j password |
| `NEO4J_DATABASE` | string \| undefined | `undefined` | Neo4j database name |
| `GRAPH_KIT_DEBUG` | boolean | `false` | Enable debug mode when `true` |

## Usage

```ts
import { env } from '@graph-kit/sdk';

// Typed access — no process.env checks needed
const uri = env.NEO4J_URI;
const debug = env.GRAPH_KIT_DEBUG;

// In graph-kit.config.ts
export default defineConfig({
  driver: {
    uri: env.NEO4J_URI,
    username: env.NEO4J_USER,
    password: env.NEO4J_PASSWORD,
    database: env.NEO4J_DATABASE,
  },
  debug: env.GRAPH_KIT_DEBUG,
});
```

## .env Example

```
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password
NEO4J_DATABASE=neo4j
GRAPH_KIT_DEBUG=false
```

## Validation Behavior

- Missing required variables throw a descriptive error at import time.
- `emptyStringAsUndefined: true` means empty strings are treated as unset.
- Optional variables return `undefined` if not set.
- Default values are applied when the variable is absent.
