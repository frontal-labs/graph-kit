// @graph-kit/migrate/src/model/migration.ts
// Migration model interfaces

import type { GraphSchemaRegistry, QueryCompiler } from '@graph-kit/sdk';

export interface Migration {
  version: string;
  name: string;
  timestamp: number;
  up: (compiler: QueryCompiler) => string[];
  down: (compiler: QueryCompiler) => string[];
}

export interface CreateMigrationOptions {
  name: string;
  schema?: GraphSchemaRegistry;
  migrationsDir?: string;
}
