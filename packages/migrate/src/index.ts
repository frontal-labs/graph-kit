// @graph-om/migrate/src/index.ts
// Graph-OM migration system - schema versioning and database migrations
// Barrel export - manually selects and re-exports public API

// Model domain
export type { CreateMigrationOptions, Migration } from './model/migration';
export type { MigrationOptions, MigrationStatus } from './runner/migration-options';
// Runner domain
export { MigrationRunner } from './runner/migration-runner';
export type { NodeDiff, PropertyDiff, SchemaDiff } from './schema/schema-diff';
// Schema domain
export { diffSchemas, generateMigrationFromDiff } from './schema/schema-diff';
export type { CreateMigrationTemplateOptions } from './template/migration-template';

// Template domain
export { createMigrationTemplate } from './template/migration-template';
// Version domain
export { generateVersion } from './version/version';
