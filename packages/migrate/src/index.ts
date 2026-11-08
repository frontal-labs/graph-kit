// @graph-om/migrate/src/index.ts
// Graph-OM migration system - schema versioning and database migrations

import type { DriverAdapter, GraphSchemaRegistry } from '@graph-om/sdk';
import { QueryCompiler } from '@graph-om/sdk';
import { raiseGraphError } from '@graph-om/sdk/errors';

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

export interface Migration {
  version: string;
  name: string;
  timestamp: number;
  up: (compiler: QueryCompiler) => string[];
  down: (compiler: QueryCompiler) => string[];
}

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
    await this.driver.connect();

    // Create migrations table if it doesn't exist
    const _createTableCypher = `
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        version STRING PRIMARY KEY,
        name STRING NOT NULL,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        checksum STRING
      )
    `;

    // For graph databases, we use a node instead of a table
    await this.driver.runQuery(
      `
      MERGE (m:Migration {table: $tableName})
      ON CREATE SET m.createdAt = datetime()
    `,
      { tableName: this.tableName },
    );
  }

  async migrate(migrations: Migration[]): Promise<Migration[]> {
    await this.initialize();

    const applied = await this.getAppliedMigrations();
    const pending = migrations.filter((m) => !applied.has(m.version));

    const appliedMigrations: Migration[] = [];

    for (const migration of pending) {
      await this.applyMigration(migration);
      appliedMigrations.push(migration);
    }

    return appliedMigrations;
  }

  async rollback(migrations: Migration[], steps: number): Promise<Migration[]> {
    await this.initialize();

    const applied = await this.getAppliedMigrations();
    const definitions = new Map(migrations.map((m) => [m.version, m]));

    // Resolve every definition up front so a missing one cannot leave the graph half-reverted
    const toRollback = Array.from(applied.keys())
      .sort((a, b) => Number(b) - Number(a))
      .slice(0, steps)
      .map((version) => {
        const migration = definitions.get(version);
        if (!migration) {
          raiseGraphError(
            `Cannot roll back migration ${version}: no matching definition provided`,
            {
              code: 'migration_failed',
              statusCode: 500,
              retry: { retryable: false },
              metadata: { version },
            },
          );
        }
        return migration;
      });

    for (const migration of toRollback) {
      await this.revertMigration(migration);
    }

    return toRollback;
  }

  async status(migrations: Migration[]): Promise<MigrationStatus[]> {
    await this.initialize();

    const applied = await this.getAppliedMigrations();

    return migrations.map((migration) => ({
      version: migration.version,
      name: migration.name,
      applied: applied.has(migration.version),
      appliedAt: applied.get(migration.version)?.appliedAt,
      checksum: applied.get(migration.version)?.checksum,
    }));
  }

  private async applyMigration(migration: Migration): Promise<void> {
    const upQueries = migration.up(this.compiler);

    for (const query of upQueries) {
      await this.driver.runQuery(query);
    }

    // Record the migration
    await this.driver.runQuery(
      `
      MERGE (m:Migration {version: $version})
      SET m.name = $name,
          m.appliedAt = datetime(),
          m.checksum = $checksum
    `,
      {
        version: migration.version,
        name: migration.name,
        checksum: this.generateChecksum(migration),
      },
    );
  }

  private async revertMigration(migration: Migration): Promise<void> {
    const downQueries = migration.down(this.compiler);

    for (const query of downQueries.reverse()) {
      await this.driver.runQuery(query);
    }

    // Remove the migration record
    await this.driver.runQuery(
      `
      MATCH (m:Migration {version: $version})
      DELETE m
    `,
      { version: migration.version },
    );
  }

  private async getAppliedMigrations(): Promise<
    Map<string, { appliedAt: Date; checksum: string }>
  > {
    const result = await this.driver.runQuery(`
      MATCH (m:Migration)
      RETURN m.version as version, m.name as name, m.appliedAt as appliedAt, m.checksum as checksum
      ORDER BY m.version
    `);

    const applied = new Map<string, { appliedAt: Date; checksum: string }>();

    for (const record of result.records) {
      const version = record.get('version');
      const appliedAt = record.get('appliedAt');
      const checksum = record.get('checksum');

      if (version) {
        applied.set(version as string, {
          appliedAt: new Date(appliedAt as string),
          checksum: (checksum as string) ?? '',
        });
      }
    }

    return applied;
  }

  private generateChecksum(migration: Migration): string {
    // Simple checksum based on migration content
    const content = `${migration.version}:${migration.name}:${migration.up.toString()}:${migration.down.toString()}`;
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }
}

export function generateVersion(): string {
  return Date.now().toString();
}

export function createMigrationTemplate(options: CreateMigrationOptions): string {
  return `// Migration: ${options.name}
// Version: ${generateVersion}
// Created: ${new Date().toISOString()}

import { QueryCompiler } from '@graph-om/sdk';
import type { Migration } from '@graph-om/migrate';

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

export function loadMigrations(_migrationsDir: string): Migration[] {
  raiseGraphError(
    'loadMigrations() cannot import migration files yet. Import each migration module explicitly and pass the list to createMigrationRunner().migrate().',
    { code: 'unsupported_option', statusCode: 400, retry: { retryable: false } },
  );
}
