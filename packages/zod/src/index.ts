// @graph-om/zod/src/index.ts
// Zod validation integration for Graph-OM

import type {
  CreateInput,
  NodeConfig,
  PropertyConfig,
  PropertyType,
  UpdateInput,
} from '@graph-om/sdk';
import { z } from 'zod';

type PropertyTypeToZodType<T extends PropertyType> = T extends 'string'
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

function propertyTypeToZod<T extends PropertyType>(
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

function propertiesToZodShape(
  properties: Record<string, PropertyConfig>,
): Record<string, z.ZodTypeAny> {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const [key, config] of Object.entries(properties)) {
    const propConfig = config as PropertyConfig;
    shape[key] = propertyTypeToZod(
      propConfig.type as PropertyType,
      propConfig as PropertyConfig<any>,
    );
  }

  return shape;
}

export function toZodSchema<T extends string>(
  nodeConfig: NodeConfig<T, any>,
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape = propertiesToZodShape(nodeConfig.properties);
  return z.object(shape);
}

export function toCreateSchema<T extends string>(
  nodeConfig: NodeConfig<T, any>,
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const [key, config] of Object.entries(nodeConfig.properties)) {
    const propConfig = config as PropertyConfig;
    const schema = propertyTypeToZod(
      propConfig.type as PropertyType,
      propConfig as PropertyConfig<any>,
    );
    if (propConfig.nullable && propConfig.default === undefined) {
      shape[key] = schema.optional();
    } else {
      shape[key] = schema;
    }
  }

  return z.object(shape);
}

export function toUpdateSchema<T extends string>(
  nodeConfig: NodeConfig<T, any>,
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const [key, config] of Object.entries(nodeConfig.properties)) {
    const propConfig = config as PropertyConfig;
    if (propConfig.primary) continue;
    const schema = propertyTypeToZod(propConfig.type, propConfig);
    shape[key] = schema.optional();
  }

  return z.object(shape);
}

export function validateCreate<T extends string>(
  nodeConfig: NodeConfig<T, any>,
  data: unknown,
):
  | { success: true; data: CreateInput<Record<string, unknown>> }
  | { success: false; error: z.ZodError } {
  const schema = toCreateSchema(nodeConfig);
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data as CreateInput<Record<string, unknown>> };
  }
  return { success: false, error: result.error };
}

export function validateUpdate<T extends string>(
  nodeConfig: NodeConfig<T, any>,
  data: unknown,
):
  | { success: true; data: UpdateInput<Record<string, unknown>> }
  | { success: false; error: z.ZodError } {
  const schema = toUpdateSchema(nodeConfig);
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data as UpdateInput<Record<string, unknown>> };
  }
  return { success: false, error: result.error };
}

export function validationHooks<T extends string>(
  nodeConfig: NodeConfig<T, any>,
  options?: {
    beforeCreate?: boolean;
    beforeUpdate?: boolean;
  },
): {
  beforeCreate?: (data: unknown) => CreateInput<Record<string, unknown>>;
  beforeUpdate?: (data: unknown) => UpdateInput<Record<string, unknown>>;
} {
  const hooks: {
    beforeCreate?: (data: unknown) => CreateInput<Record<string, unknown>>;
    beforeUpdate?: (data: unknown) => UpdateInput<Record<string, unknown>>;
  } = {};

  if (options?.beforeCreate !== false) {
    hooks.beforeCreate = (data: unknown) => {
      const result = validateCreate(nodeConfig, data);
      if (!result.success) {
        throw result.error;
      }
      return result.data;
    };
  }

  if (options?.beforeUpdate !== false) {
    hooks.beforeUpdate = (data: unknown) => {
      const result = validateUpdate(nodeConfig, data);
      if (!result.success) {
        throw result.error;
      }
      return result.data;
    };
  }

  return hooks;
}
