// @graph-om/sdk/src/migration/index.ts
// Migration system for Graph-OM - schema versioning and database migrations

import { raiseGraphError } from '../errors';
import { QueryCompiler } from '../query';
import type { DriverAdapter, GraphSchemaRegistry } from '../types';

export interface Migration {
  version: string;
  name: string;
  timestamp: number;
  up: (compiler: QueryCompiler) => string | string[];
  down?: (compiler: QueryCompiler) => string | string[];
}

export interface MigrationRecord {
  version: string;
  name: string;
  appliedAt: Date;
  checksum: string;
}

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

export interface CreateMigrationOptions {
  name: string;
  schema?: GraphSchemaRegistry;
  migrationsDir?: string;
}

export class MigrationRunner {
  private driver: DriverAdapter;
  private compiler: QueryCompiler;
  private migrationsDir: string;
  private tableName: string;
  private schema?: GraphSchemaRegistry;

  constructor(options: MigrationOptions) {
    this.driver = options.driver;
    this.compiler = new QueryCompiler();
    this.migrationsDir = options.migrationsDir ?? './migrations';
    this.tableName = options.tableName ?? '_graph_om_migrations';
    this.schema = options.schema;
  }

  async initialize(): Promise<void> {
    const _createTableCypher = `
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        version STRING PRIMARY KEY,
        name STRING NOT NULL,
        applied_at TIMESTAMP NOT NULL,
        checksum STRING NOT NULL
      )
    `;
    // Neo4j doesn't have CREATE TABLE, use constraints instead
    const cypher = `
      CREATE CONSTRAINT ${this.tableName}_version_unique IF NOT EXISTS
      FOR (m:Migration) REQUIRE m.version IS UNIQUE
    `;
    await this.driver.runQuery(cypher);
  }

  async getAppliedMigrations(): Promise<MigrationRecord[]> {
    const cypher = `
      MATCH (m:Migration)
      RETURN m.version AS version, m.name AS name, m.applied_at AS appliedAt, m.checksum AS checksum
      ORDER BY m.applied_at ASC
    `;
    const result = await this.driver.runQuery(cypher);
    return result.records.map((record) => ({
      version: record.get('version') as string,
      name: record.get('name') as string,
      appliedAt: new Date(record.get('appliedAt') as string),
      checksum: record.get('checksum') as string,
    }));
  }

  async getPendingMigrations(migrations: Migration[]): Promise<Migration[]> {
    const applied = await this.getAppliedMigrations();
    const appliedVersions = new Set(applied.map((m) => m.version));
    return migrations.filter((m) => !appliedVersions.has(m.version));
  }

  async applyMigration(migration: Migration): Promise<void> {
    const upResult = migration.up(this.compiler);
    const statements = Array.isArray(upResult) ? upResult : [upResult];

    for (const statement of statements) {
      await this.driver.runQuery(statement);
    }

    const checksum = this.computeChecksum(migration);
    const recordCypher = `
      CREATE (m:Migration {
        version: $version,
        name: $name,
        applied_at: datetime(),
        checksum: $checksum
      })
    `;
    await this.driver.runQuery(recordCypher, {
      version: migration.version,
      name: migration.name,
      checksum,
    });
  }

  async rollbackMigration(migration: Migration): Promise<void> {
    if (!migration.down) {
      raiseGraphError(`Migration ${migration.version} (${migration.name}) has no down migration`, {
        code: 'migration_failed',
        statusCode: 500,
        retry: { retryable: false },
        metadata: { version: migration.version },
      });
    }

    const downResult = migration.down(this.compiler);
    const statements = Array.isArray(downResult) ? downResult : [downResult];

    for (const statement of statements) {
      await this.driver.runQuery(statement);
    }

    const deleteCypher = `
      MATCH (m:Migration {version: $version})
      DELETE m
    `;
    await this.driver.runQuery(deleteCypher, { version: migration.version });
  }

  async migrate(migrations: Migration[]): Promise<MigrationRecord[]> {
    await this.initialize();
    const pending = await this.getPendingMigrations(migrations);
    const applied: MigrationRecord[] = [];

    for (const migration of pending) {
      await this.applyMigration(migration);
      applied.push({
        version: migration.version,
        name: migration.name,
        appliedAt: new Date(),
        checksum: this.computeChecksum(migration),
      });
    }

    return applied;
  }

  async rollback(migrations: Migration[], steps = 1): Promise<MigrationRecord[]> {
    await this.initialize();
    const applied = await this.getAppliedMigrations();
    const toRollback = applied.slice(-steps).reverse();
    const rolledBack: MigrationRecord[] = [];

    for (const record of toRollback) {
      const migration = migrations.find((m) => m.version === record.version);
      if (!migration) {
        raiseGraphError(`Migration ${record.version} not found in migration list`, {
          code: 'migration_failed',
          statusCode: 500,
          retry: { retryable: false },
          metadata: { version: record.version },
        });
      }
      await this.rollbackMigration(migration);
      rolledBack.push(record);
    }

    return rolledBack;
  }

  async status(migrations: Migration[]): Promise<MigrationStatus[]> {
    await this.initialize();
    const applied = await this.getAppliedMigrations();
    const appliedMap = new Map(applied.map((m) => [m.version, m]));

    return migrations.map((m) => {
      const appliedRecord = appliedMap.get(m.version);
      return {
        version: m.version,
        name: m.name,
        applied: !!appliedRecord,
        appliedAt: appliedRecord?.appliedAt,
        checksum: appliedRecord?.checksum,
      };
    });
  }

  private computeChecksum(migration: Migration): string {
    const content = `${migration.version}:${migration.name}:${migration.up.toString()}:${migration.down?.toString() ?? ''}`;
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }
}

export function createMigrationRunner(options: MigrationOptions): MigrationRunner {
  return new MigrationRunner(options);
}

export function generateVersion(): string {
  return new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
}

export function createMigrationTemplate(options: CreateMigrationOptions): string {
  const version = generateVersion();
  const className = options.name
    .split(/[-_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');

  return `// Migration: ${className}
// Version: ${version}
// Created: ${new Date().toISOString()}

import { QueryCompiler } from '@graph-om/sdk/query';
import type { Migration } from '@graph-om/sdk/migration';

export const migration: Migration = {
  version: '${version}',
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

export interface SchemaDiff {
  addedNodes: string[];
  removedNodes: string[];
  modifiedNodes: Map<string, NodeDiff>;
  addedRelations: RelationDiff[];
  removedRelations: RelationDiff[];
}

export interface NodeDiff {
  addedProperties: string[];
  removedProperties: string[];
  modifiedProperties: Map<string, PropertyDiff>;
  addedIndexes: string[];
  removedIndexes: string[];
}

export interface PropertyDiff {
  type?: { from: string; to: string };
  primary?: { from: boolean; to: boolean };
  unique?: { from: boolean; to: boolean };
  nullable?: { from: boolean; to: boolean };
  array?: { from: boolean; to: boolean };
  default?: { from: unknown; to: unknown };
}

export interface RelationDiff {
  fromNode: string;
  relationName: string;
  type?: { from: string; to: string };
  direction?: { from: string; to: string };
  target?: { from: string; to: string };
  multiple?: { from: boolean; to: boolean };
  addedProperties: string[];
  removedProperties: string[];
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
    const commonProps = [...newProps].filter((p) => oldProps.has(p));

    const modifiedProperties = new Map<string, PropertyDiff>();

    for (const propName of commonProps) {
      const oldProp = oldNode.properties[propName];
      const newProp = newNode.properties[propName];
      if (!oldProp || !newProp) continue;

      const diff: PropertyDiff = {};

      if (oldProp.type !== newProp.type) {
        diff.type = { from: oldProp.type, to: newProp.type };
      }
      if (oldProp.primary !== newProp.primary) {
        diff.primary = { from: oldProp.primary ?? false, to: newProp.primary ?? false };
      }
      if (oldProp.unique !== newProp.unique) {
        diff.unique = { from: oldProp.unique ?? false, to: newProp.unique ?? false };
      }
      if (oldProp.nullable !== newProp.nullable) {
        diff.nullable = { from: oldProp.nullable ?? false, to: newProp.nullable ?? false };
      }
      if (oldProp.array !== newProp.array) {
        diff.array = { from: oldProp.array ?? false, to: newProp.array ?? false };
      }
      if (oldProp.default !== newProp.default) {
        diff.default = { from: oldProp.default, to: newProp.default };
      }

      if (Object.keys(diff).length > 0) {
        modifiedProperties.set(propName, diff);
      }
    }

    const oldIndexes = new Set(
      (oldNode.indexes ?? []).map((idx: { fields: string[] }) => idx.fields.join(',')),
    );
    const newIndexes = new Set(
      (newNode.indexes ?? []).map((idx: { fields: string[] }) => idx.fields.join(',')),
    );

    const addedIndexes = [...newIndexes].filter((i) => !oldIndexes.has(i));
    const removedIndexes = [...oldIndexes].filter((i) => !newIndexes.has(i));

    if (
      addedProperties.length > 0 ||
      removedProperties.length > 0 ||
      modifiedProperties.size > 0 ||
      addedIndexes.length > 0 ||
      removedIndexes.length > 0
    ) {
      modifiedNodes.set(nodeName, {
        addedProperties,
        removedProperties,
        modifiedProperties,
        addedIndexes,
        removedIndexes,
      });
    }
  }

  // Diff relations
  const addedRelations: RelationDiff[] = [];
  const removedRelations: RelationDiff[] = [];

  for (const nodeName of commonNodes) {
    const oldNode = oldSchema[nodeName];
    const newNode = newSchema[nodeName];
    if (!oldNode || !newNode) continue;

    const oldRels = new Set(Object.keys(oldNode.relations));
    const newRels = new Set(Object.keys(newNode.relations));

    for (const relName of [...newRels].filter((r) => !oldRels.has(r))) {
      const newRel = newNode.relations[relName];
      if (!newRel) continue;
      addedRelations.push({
        fromNode: nodeName,
        relationName: relName,
        type: { from: '', to: newRel.type },
        direction: { from: '', to: newRel.direction },
        target: { from: '', to: newRel.target },
        multiple: { from: false, to: newRel.multiple ?? false },
        addedProperties: Object.keys(newRel.properties ?? {}) as string[],
        removedProperties: [],
      });
    }

    for (const relName of [...oldRels].filter((r) => !newRels.has(r))) {
      const oldRel = oldNode.relations[relName];
      if (!oldRel) continue;
      removedRelations.push({
        fromNode: nodeName,
        relationName: relName,
        type: { from: oldRel.type, to: '' },
        direction: { from: oldRel.direction, to: '' },
        target: { from: oldRel.target, to: '' },
        multiple: { from: oldRel.multiple ?? false, to: false },
        addedProperties: [],
        removedProperties: Object.keys(oldRel.properties ?? {}) as string[],
      });
    }

    for (const relName of [...newRels].filter((r) => oldRels.has(r))) {
      const oldRel = oldNode.relations[relName];
      if (!oldRel) continue;
      const newRel = newNode.relations[relName];
      if (!newRel) continue;

      const diff: RelationDiff = {
        fromNode: nodeName,
        relationName: relName,
        addedProperties: [],
        removedProperties: [],
      };

      let hasChanges = false;

      if (oldRel.type !== newRel.type) {
        diff.type = { from: oldRel.type, to: newRel.type };
        hasChanges = true;
      }
      if (oldRel.direction !== newRel.direction) {
        diff.direction = { from: oldRel.direction, to: newRel.direction };
        hasChanges = true;
      }
      if (oldRel.target !== newRel.target) {
        diff.target = { from: oldRel.target, to: newRel.target };
        hasChanges = true;
      }
      if ((oldRel.multiple ?? false) !== (newRel.multiple ?? false)) {
        diff.multiple = { from: oldRel.multiple ?? false, to: newRel.multiple ?? false };
        hasChanges = true;
      }

      const oldRelProps = new Set(Object.keys(oldRel.properties ?? {}) as string[]);
      const newRelProps = new Set(Object.keys(newRel.properties ?? {}) as string[]);

      diff.addedProperties = [...newRelProps].filter((p) => !oldRelProps.has(p));
      diff.removedProperties = [...oldRelProps].filter((p) => !newRelProps.has(p));

      if (diff.addedProperties.length > 0 || diff.removedProperties.length > 0) {
        hasChanges = true;
      }

      if (hasChanges) {
        addedRelations.push(diff);
      }
    }
  }

  return {
    addedNodes,
    removedNodes,
    modifiedNodes,
    addedRelations,
    removedRelations,
  };
}

export function generateMigrationFromDiff(diff: SchemaDiff, name: string): Migration {
  const version = generateVersion();
  const _compiler = new QueryCompiler();
  const upStatements: string[] = [];
  const downStatements: string[] = [];

  // Handle added nodes
  for (const nodeName of diff.addedNodes) {
    upStatements.push(`// CREATE NODE: ${nodeName}`);
    downStatements.unshift(`// DROP NODE: ${nodeName}`);
  }

  // Handle removed nodes
  for (const nodeName of diff.removedNodes) {
    upStatements.push(`// DROP NODE: ${nodeName}`);
    downStatements.unshift(`// CREATE NODE: ${nodeName}`);
  }

  // Handle modified nodes
  for (const [nodeName, nodeDiff] of diff.modifiedNodes) {
    for (const propName of nodeDiff.addedProperties) {
      upStatements.push(`// ADD PROPERTY: ${nodeName}.${propName}`);
      downStatements.unshift(`// DROP PROPERTY: ${nodeName}.${propName}`);
    }
    for (const propName of nodeDiff.removedProperties) {
      upStatements.push(`// DROP PROPERTY: ${nodeName}.${propName}`);
      downStatements.unshift(`// ADD PROPERTY: ${nodeName}.${propName}`);
    }
    for (const [propName, _propDiff] of nodeDiff.modifiedProperties) {
      upStatements.push(`// MODIFY PROPERTY: ${nodeName}.${propName}`);
      downStatements.unshift(`// REVERT PROPERTY: ${nodeName}.${propName}`);
    }
    for (const index of nodeDiff.addedIndexes) {
      upStatements.push(`// CREATE INDEX: ${nodeName} (${index})`);
      downStatements.unshift(`// DROP INDEX: ${nodeName} (${index})`);
    }
    for (const index of nodeDiff.removedIndexes) {
      upStatements.push(`// DROP INDEX: ${nodeName} (${index})`);
      downStatements.unshift(`// CREATE INDEX: ${nodeName} (${index})`);
    }
  }

  // Handle added relations
  for (const relDiff of diff.addedRelations) {
    upStatements.push(`// ADD RELATION: ${relDiff.fromNode}.${relDiff.relationName}`);
    downStatements.unshift(`// DROP RELATION: ${relDiff.fromNode}.${relDiff.relationName}`);
  }

  // Handle removed relations
  for (const relDiff of diff.removedRelations) {
    upStatements.push(`// DROP RELATION: ${relDiff.fromNode}.${relDiff.relationName}`);
    downStatements.unshift(`// ADD RELATION: ${relDiff.fromNode}.${relDiff.relationName}`);
  }

  return {
    version,
    name,
    timestamp: Date.now(),
    up: () => (upStatements.length > 0 ? upStatements : []),
    down: () => (downStatements.length > 0 ? downStatements : []),
  };
}

/**
 * Not supported yet: migration files are TypeScript modules, which cannot be imported
 * synchronously. Import them explicitly and pass the list to `MigrationRunner`.
 */
export function loadMigrations(_migrationsDir: string): Migration[] {
  raiseGraphError(
    'loadMigrations() cannot import migration files yet. Import each migration module explicitly and pass the list to createMigrationRunner().migrate().',
    { code: 'unsupported_option', statusCode: 400, retry: { retryable: false } },
  );
}
