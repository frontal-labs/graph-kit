// @graph-kit/zod/src/validation/validate.ts
// Validation functions for create and update operations

import type { CreateInput, NodeConfig, PropertyConfig, UpdateInput } from '@graph-kit/sdk';
import type { z } from 'zod';
import { toCreateSchema, toUpdateSchema } from '../schema/factory';

export function validateCreate<T extends string>(
  nodeConfig: NodeConfig<T, Record<string, PropertyConfig>>,
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
  nodeConfig: NodeConfig<T, Record<string, PropertyConfig>>,
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
