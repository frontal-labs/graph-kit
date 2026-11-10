// @graph-kit/zod/src/validation/hooks.ts
// Validation hooks for create and update lifecycle events

import type { CreateInput, NodeConfig, PropertyConfig, UpdateInput } from '@graph-kit/sdk';
import { validateCreate, validateUpdate } from './validate';

export function validationHooks<T extends string>(
  nodeConfig: NodeConfig<T, Record<string, PropertyConfig>>,
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
