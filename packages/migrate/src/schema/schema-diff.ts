// @graph-om/migrate/src/schema/schema-diff.ts
// Schema diffing and migration generation from diffs

import type { GraphSchemaRegistry, QueryCompiler } from '@graph-om/sdk';
import type { Migration } from '../model/migration';
import { generateVersion } from '../version/version';

export interface SchemaDiff {
  addedNodes: string[];
  removedNodes: string[];
  modifiedNodes: Map<string, NodeDiff>;
  addedRelations: string[];
  removedRelations: string[];
}

export interface NodeDiff {
  addedProperties: string[];
  removedProperties: string[];
  modifiedProperties: Map<string, PropertyDiff>;
  addedIndexes: Array<{ fields: string[]; unique?: boolean }>;
  removedIndexes: Array<{ fields: string[]; unique?: boolean }>;
  addedConstraints: Array<{ fields: string[]; type: 'UNIQUE' | 'EXISTS' }>;
  removedConstraints: Array<{ fields: string[]; type: 'UNIQUE' | 'EXISTS' }>;
}

export interface PropertyDiff {
  typeChanged?: boolean;
  oldType?: string;
  newType?: string;
  nullableChanged?: boolean;
  arrayChanged?: boolean;
  primaryChanged?: boolean;
  uniqueChanged?: boolean;
  defaultChanged?: boolean;
}

export function diffSchemas(
  oldSchema: GraphSchemaRegistry,
  newSchema: GraphSchemaRegistry,
): SchemaDiff {
  const oldNodes = new Set(Object.keys(oldSchema));
  const newNodes = new Set(Object.keys(newSchema));

  const addedNodes = [...newNodes].filter((n) => !oldNodes.has(n));
  const removedNodes = [...oldNodes].filter((n) => !newNodes.has(n));
  const commonNodes = [...newNodes].filter((n) => oldNodes.has(n));

  const modifiedNodes = new Map<string, NodeDiff>();

  for (const nodeName of commonNodes) {
    const oldNode = oldSchema[nodeName];
    const newNode = newSchema[nodeName];

    if (!oldNode || !newNode) continue;

    const oldProps = new Set(Object.keys(oldNode.properties));
    const newProps = new Set(Object.keys(newNode.properties));

    const addedProperties = [...newProps].filter((p) => !oldProps.has(p));
    const removedProperties = [...oldProps].filter((p) => !newProps.has(p));
    const commonProperties = [...newProps].filter((p) => oldProps.has(p));

    const modifiedProperties = new Map<string, PropertyDiff>();

    for (const propName of commonProperties) {
      const oldProp = oldNode.properties[propName];
      const newProp = newNode.properties[propName];
      if (!oldProp || !newProp) continue;

      const diff: PropertyDiff = {};
      let hasChanges = false;

      if (oldProp.type !== newProp.type) {
        diff.typeChanged = true;
        diff.oldType = oldProp.type;
        diff.newType = newProp.type;
        hasChanges = true;
      }

      if (oldProp.nullable !== newProp.nullable) {
        diff.nullableChanged = true;
        hasChanges = true;
      }

      if (oldProp.array !== newProp.array) {
        diff.arrayChanged = true;
        hasChanges = true;
      }

      if (oldProp.primary !== newProp.primary) {
        diff.primaryChanged = true;
        hasChanges = true;
      }

      if (oldProp.unique !== newProp.unique) {
        diff.uniqueChanged = true;
        hasChanges = true;
      }

      if (oldProp.default !== newProp.default) {
        diff.defaultChanged = true;
        hasChanges = true;
      }

      if (hasChanges) {
        modifiedProperties.set(propName, diff);
      }
    }

    if (addedProperties.length > 0 || removedProperties.length > 0 || modifiedProperties.size > 0) {
      modifiedNodes.set(nodeName, {
        addedProperties,
        removedProperties,
        modifiedProperties,
        addedIndexes: [],
        removedIndexes: [],
        addedConstraints: [],
        removedConstraints: [],
      });
    }
  }

  return {
    addedNodes,
    removedNodes,
    modifiedNodes,
    addedRelations: [],
    removedRelations: [],
  };
}

export function generateMigrationFromDiff(diff: SchemaDiff, name: string): Migration {
  return {
    version: generateVersion(),
    name,
    timestamp: Date.now(),

    up: (_compiler: QueryCompiler) => {
      const statements: string[] = [];

      // Add new nodes
      for (const nodeName of diff.addedNodes) {
        // This would need the actual schema to generate proper CREATE statements
        statements.push(`// CREATE NODE ${nodeName}`);
      }

      // Add new properties
      for (const [nodeName, nodeDiff] of diff.modifiedNodes) {
        for (const propName of nodeDiff.addedProperties) {
          statements.push(`// ADD PROPERTY ${nodeName}.${propName}`);
        }
      }

      return statements;
    },

    down: (_compiler: QueryCompiler) => {
      const statements: string[] = [];

      // Remove nodes
      for (const nodeName of diff.removedNodes) {
        statements.push(`// DROP NODE ${nodeName}`);
      }

      return statements;
    },
  };
}
