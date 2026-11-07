# API Reference

## @graph-om/core

### Schema DSL

#### `node(label)`

Create a node config builder.

```ts
const User = node('User')
  .add('id', string({ primary: true }))
  .add('name', string())
  .build();
```

#### `.add(name, typeConfig)`

Add a property to a node. Returns the builder for chaining.

#### `.build()`

Finalize and return the `NodeConfig`.

#### `defineRel(type, from, to)`

Create a relationship definition builder.

```ts
const AUTHORS = defineRel('AUTHORS', 'User', 'Post')
  .add('createdAt', date())
  .build();
```

#### `schema()`

Create a schema registry builder.

```ts
const graph = schema()
  .add('User', User)
  .add('Post', Post)
  .rel('AUTHORS', AUTHORS)
  .build();
```

### Property Types

| Type | zod equivalent | JS Type |
|---|---|---|
| `string()` | `z.string()` | `string` |
| `number()` | `z.number()` | `number` |
| `boolean()` | `z.boolean()` | `boolean` |
| `date()` | `z.date()` | `Date` |
| `bigint()` | `z.bigint()` | `bigint` |
| `float()` | `z.number()` | `number` |
| `uuid()` | `z.string().uuid()` | `string` |
| `json()` | `z.unknown()` | `unknown` |

### Property Options

| Option | Type | Description |
|---|---|---|
| `primary` | boolean | Marks as primary key |
| `unique` | boolean | Marks as unique |
| `index` | boolean | Creates an index |
| `default` | value \| () => value | Default value |
| `nullable` | boolean | Allows null |
| `array` | boolean | Array of values |

### Client

#### `new GraphClient(driver, schemaNodes)`

Create a Graph client instance.

#### `client.findMany(label, options)`

Find multiple nodes.

#### `client.findUnique(label, options)`

Find a single node.

#### `client.create(label, options)`

Create a node.

#### `client.update(label, options)`

Update a node.

#### `client.delete(label, options)`

Delete a node.

#### `client.registerNode(name, config)`

Register a node config.

#### `client.registerNodes(nodes)`

Register multiple node configs.

### Config

#### `defineConfig(config)`

Type-safe config wrapper (identity function).

#### `resolveConfig(config)`

Resolve config with defaults applied.

#### `loadConfig(cwd?)`

Load config from disk.

#### `getDefaultConfig(schemaPath?)`

Get default config shape.

#### `env`

Validated environment variables (see ENVIRONMENT_VARIABLES.md).

## @graph-om/neo4j

### `createNeo4jDriver(config)`

Create a Neo4j driver adapter.

```ts
import { createNeo4jDriver } from '@graph-om/neo4j';

const driver = createNeo4jDriver({
  uri: env.NEO4J_URI,
  username: env.NEO4J_USER,
  password: env.NEO4J_PASSWORD,
  database: env.NEO4J_DATABASE,
});

await driver.connect();
// ...
await driver.disconnect();
```

## @graph-om/zod

Zod validation integration for Graph-OM schemas. Generates zod schemas alongside TypeScript types when `output.zod: true` in `graph-om.config.ts`.
