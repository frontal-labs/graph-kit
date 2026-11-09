// @graph-om/zod/src/schema/types.ts
// Type aliases for Zod schema generation

import type { PropertyType } from '@graph-om/sdk';
import type { z } from 'zod';

export type PropertyTypeToZodType<T extends PropertyType> = T extends 'string'
  ? z.ZodString
  : T extends 'number'
    ? z.ZodNumber
    : T extends 'boolean'
      ? z.ZodBoolean
      : T extends 'date'
        ? z.ZodDate
        : T extends 'bigint'
          ? z.ZodBigInt
          : T extends 'float'
            ? z.ZodNumber
            : T extends 'uuid'
              ? z.ZodString
              : T extends 'json'
                ? z.ZodUnknown
                : z.ZodTypeAny;
