// @graph-om/migrate/src/schema/index.ts
// Schema domain barrel

export type { NodeDiff, PropertyDiff, SchemaDiff } from './schema-diff';
export { diffSchemas, generateMigrationFromDiff } from './schema-diff';
