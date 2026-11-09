// @graph-om/migrate/src/runner/migration-runner.ts
// Migration execution engine - applies, rolls back, and reports migration status

import type { DriverAdapter } from '@graph-om/sdk';
import { QueryCompiler } from '@graph-om/sdk';
import { raiseGraphError } from '@graph-om/sdk/errors';
import type { Migration } from '../model/migration';
import type { MigrationOptions, MigrationStatus } from './migration-options';

export class MigrationRunner {
  private driver: DriverAdapter;
  private compiler: QueryCompiler;
  private migrationsDir: string;
  private tableName: string;
  private schema?: import('@graph-om/sdk').GraphSchemaRegistry;

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
