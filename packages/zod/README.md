# @graph-om/zod

Zod validation integration for Graph-OM. Converts `NodeConfig` objects into Zod schemas and provides create/update validators.

```ts
import { toZodSchema, toCreateSchema, toUpdateSchema, validateCreate, validateUpdate, validationHooks } from '@graph-om/zod';
import { User } from './schema.js';

const schema = toZodSchema(User);
const result = validateCreate(User, payload);
if (!result.success) {
  console.error(result.error.flatten());
}

const hooks = validationHooks(User);
hooks.beforeCreate?.(payload); // throws ZodError when invalid
```

## Type mapping

| Property type | Zod |
| --- | --- |
| `string` | `z.string()` |
| `number` / `float` | `z.number()` |
| `boolean` | `z.boolean()` |
| `date` | `z.date()` |
| `bigint` | `z.bigint()` |
| `uuid` | `z.string().uuid()` |
| `json` | `z.unknown()` |

`array: true` wraps in `z.array(...)`; `nullable: true` then appends `.nullable()` (so `array + nullable` = `T[] | null`).

## License

MIT
