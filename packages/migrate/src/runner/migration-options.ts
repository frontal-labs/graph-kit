// @graph-kit/migrate/src/runner/migration-options.ts
// Migration runner options and status types

import type { DriverAdapter, GraphSchemaRegistry } from '@graph-kit/sdk';

export interface MigrationOptions {
  migrationsDir?: string;
  tableName?: string;
  driver: DriverAdapter;
  schema?: GraphSchemaRegistry;
}

export interface MigrationStatus {
  version: string;
  name: string;
  applied: boolean;
  appliedAt?: Date;
  checksum?: string;
}
