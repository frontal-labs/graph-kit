// @graph-kit/cli/src/commands/migrate.ts
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { env } from '@graph-kit/sdk';
import { createNeo4jDriver } from '@graph-kit/sdk/driver/neo4j';
import { raiseGraphError } from '@graph-kit/sdk/errors';
import {
  createMigrationRunner,
  createMigrationTemplate,
  generateVersion,
  type Migration,
  type RelationDiff,
  type SchemaDiff,
} from '@graph-kit/sdk/migration';
import { Command } from 'commander';
import { loadProjectConfig } from './generate.js';

interface MigrateOptions {
  dir?: string;
  steps?: string;
}

interface MigrateCreateOptions {
  dir?: string;
}

export function createMigrateCommand(): Command {
  const migrate = new Command('migrate')
    .description('Database migration commands')
    .addCommand(createMigrateUpCommand())
    .addCommand(createMigrateDownCommand())
    .addCommand(createMigrateStatusCommand())
    .addCommand(createMigrateCreateCommand())
    .addCommand(createMigrateDiffCommand());

  return migrate;
}

function createMigrateUpCommand(): Command {
  return new Command('up')
    .description('Apply pending migrations')
    .option('--dir <path>', 'Migrations directory', './migrations')
    .action(async (options: MigrateOptions) => {
      await runMigrateUp(options.dir ?? './migrations');
    });
}

function createMigrateDownCommand(): Command {
  return new Command('down')
    .description('Rollback last migration(s)')
    .option('--dir <path>', 'Migrations directory', './migrations')
    .option('--steps <number>', 'Number of migrations to rollback', '1')
    .action(async (options: MigrateOptions) => {
      await runMigrateDown(options.dir ?? './migrations', parseInt(options.steps ?? '1', 10));
    });
}

function createMigrateStatusCommand(): Command {
  return new Command('status')
    .description('Show migration status')
    .option('--dir <path>', 'Migrations directory', './migrations')
    .action(async (options: MigrateOptions) => {
      await runMigrateStatus(options.dir ?? './migrations');
    });
}

function createMigrateCreateCommand(): Command {
  return new Command('create')
    .description('Create a new migration file')
    .argument('<name>', 'Migration name (e.g., add_user_email_index)')
    .option('--dir <path>', 'Migrations directory', './migrations')
    .action(async (name: string, options: MigrateCreateOptions) => {
      await runMigrateCreate(name, options.dir ?? './migrations');
    });
}

function createMigrateDiffCommand(): Command {
  return new Command('diff')
    .description('Generate migration from schema diff')
    .argument('<name>', 'Migration name')
    .option('--dir <path>', 'Migrations directory', './migrations')
    .action(async (name: string, options: MigrateCreateOptions) => {
      await runMigrateDiff(name, options.dir ?? './migrations');
    });
}

async function runMigrateUp(migrationsDir: string): Promise<void> {
  const projectRoot = process.cwd();
  const config = loadProjectConfig(projectRoot);
  const { schemaPath } = config;

  // Load schema to pass to migration runner
  const { parseSchemaFile } = await import('@graph-kit/sdk/schema');
  const result = parseSchemaFile(schemaPath);
  const schema = result.schema;

  // Load migration files
  const migrations = await loadMigrationFiles(migrationsDir);

  // Connect to database
  const driver = createNeo4jDriver({
    type: 'neo4j',
    uri: env.NEO4J_URI,
    username: env.NEO4J_USER,
    password: env.NEO4J_PASSWORD,
  });
  await driver.connect();

  const runner = createMigrationRunner({
    driver,
    migrationsDir,
    schema,
  });

  try {
    const applied = await runner.migrate(migrations);
    if (applied.length === 0) {
      console.log('✓ No pending migrations');
    } else {
      console.log(`✓ Applied ${applied.length} migration(s):`);
      for (const m of applied) {
        console.log(`  - ${m.version}: ${m.name}`);
      }
    }
  } finally {
    await driver.disconnect();
  }
}

async function runMigrateDown(migrationsDir: string, steps: number): Promise<void> {
  const projectRoot = process.cwd();
  const config = loadProjectConfig(projectRoot);
  const { schemaPath } = config;

  const { parseSchemaFile } = await import('@graph-kit/sdk/schema');
  const result = parseSchemaFile(schemaPath);
  const schema = result.schema;

  const migrations = await loadMigrationFiles(migrationsDir);

  const driver = createNeo4jDriver({
    type: 'neo4j',
    uri: env.NEO4J_URI,
    username: env.NEO4J_USER,
    password: env.NEO4J_PASSWORD,
  });
  await driver.connect();

  const runner = createMigrationRunner({
    driver,
    migrationsDir,
    schema,
  });

  try {
    const rolledBack = await runner.rollback(migrations, steps);
    if (rolledBack.length === 0) {
      console.log('✓ No migrations to rollback');
    } else {
      console.log(`✓ Rolled back ${rolledBack.length} migration(s):`);
      for (const m of rolledBack) {
        console.log(`  - ${m.version}: ${m.name}`);
      }
    }
  } finally {
    await driver.disconnect();
  }
}

async function runMigrateStatus(migrationsDir: string): Promise<void> {
  const projectRoot = process.cwd();
  const config = loadProjectConfig(projectRoot);
  const { schemaPath } = config;

  const { parseSchemaFile } = await import('@graph-kit/sdk/schema');
  const result = parseSchemaFile(schemaPath);
  const schema = result.schema;

  const migrations = await loadMigrationFiles(migrationsDir);

  const driver = createNeo4jDriver({
    type: 'neo4j',
    uri: env.NEO4J_URI,
    username: env.NEO4J_USER,
    password: env.NEO4J_PASSWORD,
  });
  await driver.connect();

  const runner = createMigrationRunner({
    driver,
    migrationsDir,
    schema,
  });

  try {
    const status = await runner.status(migrations);
    console.log('\nMigration Status:');
    console.log('────────────────────────────────────────');
    for (const s of status) {
      const statusIcon = s.applied ? '✓' : '○';
      const appliedAt = s.appliedAt ? ` (applied: ${s.appliedAt.toISOString()})` : '';
      console.log(`${statusIcon} ${s.version}  ${s.name}${appliedAt}`);
    }
    console.log('');
  } finally {
    await driver.disconnect();
  }
}

async function runMigrateCreate(name: string, migrationsDir: string): Promise<void> {
  const fullDir = path.resolve(process.cwd(), migrationsDir);
  fs.mkdirSync(fullDir, { recursive: true });

  const version = generateVersion();
  const fileName = `${version}_${name.toLowerCase().replace(/\s+/g, '_')}.ts`;
  const filePath = path.join(fullDir, fileName);

  const template = createMigrationTemplate({ name, migrationsDir: fullDir });
  fs.writeFileSync(filePath, template);

  console.log(`✓ Created migration: ${filePath}`);
}

async function runMigrateDiff(name: string, migrationsDir: string): Promise<void> {
  const projectRoot = process.cwd();
  const config = loadProjectConfig(projectRoot);
  const { schemaPath } = config;

  const { parseSchemaFile } = await import('@graph-kit/sdk/schema');
  const result = parseSchemaFile(schemaPath);
  const newSchema = result.schema;

  // Load current applied migrations to get the "old" schema
  // For now, we'll load the last migration's schema or use a saved schema snapshot
  const _migrations = await loadMigrationFiles(migrationsDir);

  // Try to load a schema snapshot from the last migration
  let oldSchema = newSchema; // fallback - in real implementation, load from snapshot

  // If there's a schema snapshot file, use it
  const snapshotPath = path.join(migrationsDir, '.schema-snapshot.json');
  if (fs.existsSync(snapshotPath)) {
    const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf-8'));
    oldSchema = snapshot;
  }

  const { diffSchemas, generateMigrationFromDiff } = await import('@graph-kit/sdk/migration');
  const diff = diffSchemas(oldSchema, newSchema);
  const migration = generateMigrationFromDiff(diff, name);

  const fullDir = path.resolve(process.cwd(), migrationsDir);
  fs.mkdirSync(fullDir, { recursive: true });

  const version = generateVersion();
  const fileName = `${version}_${name.toLowerCase().replace(/\s+/g, '_')}.ts`;
  const filePath = path.join(fullDir, fileName);

  // Generate the migration file with actual up/down functions
  const content = generateMigrationFile(migration, diff);
  fs.writeFileSync(filePath, content);

  // Update schema snapshot
  fs.writeFileSync(snapshotPath, JSON.stringify(newSchema, null, 2));

  console.log(`✓ Created diff migration: ${filePath}`);
  console.log('\nDiff summary:');
  if (diff.addedNodes.length) console.log(`  Added nodes: ${diff.addedNodes.join(', ')}`);
  if (diff.removedNodes.length) console.log(`  Removed nodes: ${diff.removedNodes.join(', ')}`);
  if (diff.modifiedNodes.size)
    console.log(`  Modified nodes: ${[...diff.modifiedNodes.keys()].join(', ')}`);
  if (diff.addedRelations.length)
    console.log(
      `  Added relations: ${diff.addedRelations.map((r) => `${r.fromNode}.${r.relationName}`).join(', ')}`,
    );
  if (diff.removedRelations.length)
    console.log(
      `  Removed relations: ${diff.removedRelations.map((r) => `${r.fromNode}.${r.relationName}`).join(', ')}`,
    );
}

async function loadMigrationFiles(migrationsDir: string): Promise<Migration[]> {
  const fullDir = path.resolve(process.cwd(), migrationsDir);

  if (!fs.existsSync(fullDir)) {
    return [];
  }

  const files = fs
    .readdirSync(fullDir)
    .filter((f) => f.endsWith('.ts') || f.endsWith('.js'))
    .sort();

  const migrations: Migration[] = [];

  for (const file of files) {
    const version = file.match(/^(\d{14})_/)?.[1];
    if (!version) continue;

    const _name = file.replace(/^(\d{14})_/, '').replace(/\.(ts|js)$/, '');
    const filePath = path.join(fullDir, file);

    // Migration files are imported, not guessed: a file that fails to load or does not export
    // a matching migration is an error, never a silent no-op recorded as applied.
    let mod: { migration?: Migration; default?: Migration };
    try {
      mod = (await import(pathToFileURL(filePath).href)) as typeof mod;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      raiseGraphError(`Failed to load migration ${file}: ${reason}`, {
        code: 'migration_failed',
        statusCode: 500,
        cause: error,
      });
    }

    const migration = mod.migration ?? mod.default;
    if (!migration || migration.version !== version) {
      raiseGraphError(`Migration ${file} must export a migration with version ${version}`, {
        code: 'migration_failed',
        statusCode: 500,
      });
    }
    migrations.push(migration);
  }

  return migrations.sort((a, b) => a.version.localeCompare(b.version));
}

/** Added relations carry `{ from, to }` pairs, so the comment shows the `to` side */
function addedRelationLabel(rel: RelationDiff): string {
  return `${rel.fromNode}.${rel.relationName} (${rel.type?.to ?? ''} ${rel.direction?.to ?? ''} ${rel.target?.to ?? ''})`;
}

function generateMigrationFile(migration: Migration, diff: SchemaDiff): string {
  const upStatements: string[] = [];
  const downStatements: string[] = [];

  // Generate actual Cypher statements from diff
  for (const nodeName of diff.addedNodes) {
    upStatements.push(`// CREATE NODE: ${nodeName}`);
    downStatements.unshift(`// DROP NODE: ${nodeName}`);
  }

  for (const nodeName of diff.removedNodes) {
    upStatements.push(`// DROP NODE: ${nodeName}`);
    downStatements.unshift(`// CREATE NODE: ${nodeName}`);
  }

  for (const [nodeName, nodeDiff] of diff.modifiedNodes) {
    for (const propName of nodeDiff.addedProperties) {
      upStatements.push(`// ADD PROPERTY: ${nodeName}.${propName}`);
      downStatements.unshift(`// DROP PROPERTY: ${nodeName}.${propName}`);
    }
    for (const propName of nodeDiff.removedProperties) {
      upStatements.push(`// DROP PROPERTY: ${nodeName}.${propName}`);
      downStatements.unshift(`// ADD PROPERTY: ${nodeName}.${propName}`);
    }
    for (const index of nodeDiff.addedIndexes) {
      upStatements.push(
        `CREATE INDEX idx_${nodeName}_${index.replace(/,/g, '_')} IF NOT EXISTS FOR (n:${nodeName}) ON (${index.replace(/,/g, ', n.')})`,
      );
      downStatements.unshift(`DROP INDEX idx_${nodeName}_${index.replace(/,/g, '_')} IF EXISTS`);
    }
    for (const index of nodeDiff.removedIndexes) {
      upStatements.push(`DROP INDEX idx_${nodeName}_${index.replace(/,/g, '_')} IF EXISTS`);
      downStatements.unshift(
        `CREATE INDEX idx_${nodeName}_${index.replace(/,/g, '_')} IF NOT EXISTS FOR (n:${nodeName}) ON (${index.replace(/,/g, ', n.')})`,
      );
    }
  }

  for (const relDiff of diff.addedRelations) {
    upStatements.push(`// ADD RELATION: ${addedRelationLabel(relDiff)}`);
    downStatements.unshift(`// DROP RELATION: ${relDiff.fromNode}.${relDiff.relationName}`);
  }

  for (const relDiff of diff.removedRelations) {
    upStatements.push(`// DROP RELATION: ${relDiff.fromNode}.${relDiff.relationName}`);
    downStatements.unshift(`// ADD RELATION: ${relDiff.fromNode}.${relDiff.relationName}`);
  }

  return `// Migration: ${migration.name}
// Version: ${migration.version}
// Created: ${new Date().toISOString()}

import { QueryCompiler } from '@graph-kit/sdk/query';
import type { Migration } from '@graph-kit/sdk/migration';

export const migration: Migration = {
  version: ${JSON.stringify(migration.version)},
  name: ${JSON.stringify(migration.name)},
  timestamp: ${migration.timestamp},
  
  up: (compiler: QueryCompiler) => {
    return [
${upStatements.map((s) => `      ${JSON.stringify(s)}`).join(',\n')}
    ];
  },
  
  down: (compiler: QueryCompiler) => {
    return [
${downStatements.map((s) => `      ${JSON.stringify(s)}`).join(',\n')}
    ];
  },
};
`;
}
