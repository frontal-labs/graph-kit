# Configuration

Graph-OM configuration is centered around `defineConfig` and environment variables loaded via `env`.

## defineConfig

`defineConfig` is an identity function that provides type-safety for your Graph-OM project configuration. It does not perform validation at runtime — validation happens through the `env` object.

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
    maxConnectionLifetime: undefined,
    maxTransactionRetryTime: undefined,
  },
  debug: env.GRAPH_OM_DEBUG,
  exclude: [],
});
```

## GraphConfig

| Field | Type | Required | Description |
|---|---|---|---|
| `schema` | string | Yes | Path to your schema file |
| `output` | GraphOutputConfig | No | Output configuration |
| `driver` | GraphDriverConfig | No | Database driver configuration |
| `debug` | boolean | No | Enable debug logging |
| `exclude` | string[] | No | Glob patterns to exclude from generation |

### GraphOutputConfig

| Field | Type | Default | Description |
|---|---|---|---|
| `directory` | string | `./src/__generated__` | Output directory for generated files |
| `zod` | boolean | `false` | Generate zod schemas alongside types |

### GraphDriverConfig

| Field | Type | Required | Description |
|---|---|---|---|
| `type` | `'neo4j'` | Yes | Driver type (only neo4j supported) |
| `uri` | string | No | Neo4j URI (from `env.NEO4J_URI`) |
| `username` | string | No | Neo4j username (from `env.NEO4J_USER`) |
| `password` | string | No | Neo4j password (from `env.NEO4J_PASSWORD`) |
| `database` | string | No | Neo4j database name |
| `maxConnectionLifetime` | number | No | Max connection lifetime in ms |
| `maxTransactionRetryTime` | number | No | Max transaction retry time in ms |

## Environment Variables

All environment variables are parsed and validated by `@t3-oss/env-core` + zod. See `packages/sdk/src/config/keys.ts` for the full schema.

```ts
import { env } from '@graph-om/sdk';

// All values are typed and have defaults where applicable
env.NEO4J_URI;        // string
env.NEO4J_USER;       // string
env.NEO4J_PASSWORD;   // string
env.NEO4J_DATABASE;   // string | undefined
env.GRAPH_OM_DEBUG;   // boolean
```

Create a `.env` file in your project root:

```env
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password
NEO4J_DATABASE=neo4j
GRAPH_OM_DEBUG=false
```

Copy `.env.example` to `.env` after running `graph-om init`.

## resolveConfig

`resolveConfig` takes a `GraphConfig` and returns a fully-resolved config with defaults applied:

```ts
import { resolveConfig } from '@graph-om/sdk';

const config = resolveConfig({
  schema: './src/schema.ts',
});

// Result:
// {
//   schema: './src/schema.ts',
//   output: { directory: './src/__generated__', zod: false },
//   driver: { type: 'neo4j', uri: 'bolt://localhost:7687', username: 'neo4j', password: 'password' },
//   debug: false,
//   exclude: [],
// }
```

## loadConfig

`loadConfig` attempts to load a config file from the project root. Supported formats:

- `graph-om.config.ts`
- `graph-om.config.mjs`
- `graph-om.config.js`
- `graph-om.config.json`

```ts
import { loadConfig } from '@graph-om/sdk';

const config = await loadConfig(); // or loadConfig('/path/to/project')
```
