// @graph-kit/zod/src/schema/factory.ts
// Zod schema factory functions for node configs

import type { NodeConfig, PropertyConfig, PropertyType } from '@graph-kit/sdk';
import { z } from 'zod';
import { propertiesToZodShape, propertyTypeToZod } from './property';

export function toZodSchema<T extends string>(
  nodeConfig: NodeConfig<T, Record<string, PropertyConfig>>,
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape = propertiesToZodShape(nodeConfig.properties);
  return z.object(shape);
}

export function toCreateSchema<T extends string>(
  nodeConfig: NodeConfig<T, Record<string, PropertyConfig>>,
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const [key, config] of Object.entries(nodeConfig.properties)) {
    const propConfig = config as PropertyConfig;
    const schema = propertyTypeToZod(propConfig.type as PropertyType, propConfig);
    if (propConfig.nullable && propConfig.default === undefined) {
      shape[key] = schema.optional();
    } else {
      shape[key] = schema;
    }
  }

  return z.object(shape);
}

export function toUpdateSchema<T extends string>(
  nodeConfig: NodeConfig<T, Record<string, PropertyConfig>>,
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
