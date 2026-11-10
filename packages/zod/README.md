# @graph-kit/zod

Zod validation integration for Graph-Kit. Converts `NodeConfig` objects into Zod schemas and provides create/update validators and validation hooks for type-safe graph node input.

## Installation

```bash
pnpm add @graph-kit/zod zod
```

`@graph-kit/sdk` is a peer dependency — install it alongside:

```bash
pnpm add @graph-kit/sdk
```

## Quick start

```ts
import { toZodSchema, toCreateSchema, toUpdateSchema, validateCreate, validateUpdate, validationHooks } from '@graph-kit/zod';
import { User } from './schema.js';

const schema = toZodSchema(User);
const result = validateCreate(User, payload);
if (!result.success) {
  console.error(result.error.flatten());
}

const hooks = validationHooks(User);
hooks.beforeCreate?.(payload); // throws ZodError when invalid
```

## API

| Function | Description |
|----------|-------------|
| `toZodSchema(nodeConfig)` | Build a full `z.ZodObject` from all node properties |
| `toCreateSchema(nodeConfig)` | Build a create schema (nullable-without-default properties become `optional()`) |
| `toUpdateSchema(nodeConfig)` | Build an update schema (primary properties skipped, all others `optional()`) |
| `validateCreate(nodeConfig, data)` | Safe-parse create input; returns `{ success, data }` or `{ success, error: ZodError }` |
| `validateUpdate(nodeConfig, data)` | Safe-parse update input; returns `{ success, data }` or `{ success, error: ZodError }` |
| `validationHooks(nodeConfig, options?)` | Return `beforeCreate`/`beforeUpdate` hooks that throw `ZodError` on invalid input |

## Type mapping

| Property type | Zod schema |
|---------------|------------|
| `string` | `z.string()` |
| `number` / `float` | `z.number()` |
| `boolean` | `z.boolean()` |
| `date` | `z.date()` |
| `bigint` | `z.bigint()` |
| `uuid` | `z.string().uuid()` |
| `json` | `z.unknown()` |

Modifiers:
- `array: true` wraps the schema in `z.array(...)`.
- `nullable: true` appends `.nullable()` (so `array + nullable` = `T[] \| null`).
- `default` sets a Zod default value.

## Peer dependency

`@graph-kit/sdk` (`workspace:^`) provides the `NodeConfig`, `PropertyConfig`, `PropertyType`, `CreateInput`, and `UpdateInput` types used by this package.

## License

Apache 2.0
