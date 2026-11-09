// @graph-kit/migrate/src/template/migration-template.ts
// Migration file template generation

import type { GraphSchemaRegistry } from '@graph-kit/sdk';
import { generateVersion } from '../version/version';

export interface CreateMigrationTemplateOptions {
  name: string;
  schema?: GraphSchemaRegistry;
  migrationsDir?: string;
}

export function createMigrationTemplate(options: CreateMigrationTemplateOptions): string {
  return `// Migration: ${options.name}
// Version: ${generateVersion()}
// Created: ${new Date().toISOString()}

import { QueryCompiler } from '@graph-kit/sdk';
import type { Migration } from '@graph-kit/migrate';

export const migration: Migration = {
  version: '${generateVersion()}',
  name: '${options.name}',
  timestamp: ${Date.now()},

  up: (compiler: QueryCompiler) => {
    // Add your up migration Cypher statements here
    // Example: return compiler.compileCreateIndex('User', ['email'], { unique: true }).cypher;
    return [];
  },

  down: (compiler: QueryCompiler) => {
    // Add your down migration Cypher statements here
    // Example: return compiler.compileDropIndex('User', 'email').cypher;
    return [];
  },
};
`;
}
