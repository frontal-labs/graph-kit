// @graph-kit/zod/src/schema/property.ts
// Property-level Zod schema conversion

import type { PropertyConfig, PropertyType } from '@graph-kit/sdk';
import { z } from 'zod';
import type { PropertyTypeToZodType } from './types';

export function propertyTypeToZod<T extends PropertyType>(
  type: T,
  config: PropertyConfig<T>,
): PropertyTypeToZodType<T> {
  let schema: z.ZodTypeAny;

  switch (type) {
    case 'string':
      schema = z.string();
      break;
    case 'number':
      schema = z.number();
      break;
    case 'boolean':
      schema = z.boolean();
      break;
    case 'date':
      schema = z.date();
      break;
    case 'bigint':
      schema = z.bigint();
      break;
    case 'float':
      schema = z.number();
      break;
    case 'uuid':
      schema = z.string().uuid();
      break;
    case 'json':
      schema = z.unknown();
      break;
    default:
      schema = z.unknown();
  }

  if (config.array) {
    schema = z.array(schema);
  }

  if (config.nullable) {
    schema = schema.nullable();
  }

  if (config.default !== undefined) {
    const defaultValue =
      typeof config.default === 'function' ? (config.default as () => unknown)() : config.default;
    schema = schema.default(defaultValue);
  }

  return schema as PropertyTypeToZodType<T>;
}

export function propertiesToZodShape(
  properties: Record<string, PropertyConfig>,
): Record<string, z.ZodTypeAny> {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const [key, config] of Object.entries(properties)) {
    const propConfig = config as PropertyConfig;
    shape[key] = propertyTypeToZod(propConfig.type as PropertyType, propConfig);
  }

  return shape;
}
