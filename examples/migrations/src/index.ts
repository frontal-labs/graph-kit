// index.ts - Migration runner: up, status, rollback
// Run: pnpm start
// Requires Neo4j

import type { DriverAdapter } from '@graph-kit/sdk';
import { createNeo4jDriver } from '@graph-kit/sdk/driver/neo4j';
import type { Migration } from '@graph-kit/sdk/migration';
import { createMigrationRunner } from '@graph-kit/sdk/migration';
import { migration as initialSchema } from '../migrations/20240115143000_initial_schema.js';
import { migration as addUserBio } from '../migrations/20240116100000_add_user_bio.js';

const driver = createNeo4jDriver({
  type: 'neo4j',
  uri: process.env.NEO4J_URI ?? 'bolt://localhost:7687',
  username: process.env.NEO4J_USER ?? 'neo4j',
  password: process.env.NEO4J_PASSWORD ?? 'password',
});

const migrations: Migration[] = [initialSchema, addUserBio];

async function printStatus(runner: ReturnType<typeof createMigrationRunner>, label: string) {
  const statuses = await runner.status(migrations);
  console.log(`\n${label}`);
  for (const status of statuses) {
    console.log(`  ${status.applied ? '[x]' : '[ ]'} ${status.version} ${status.name}`);
  }
}

async function main() {
  await driver.connect();
  const runner = createMigrationRunner({
    driver: driver as DriverAdapter,
    schema: undefined,
  });

  await printStatus(runner, 'Before applying migrations:');

  console.log('\n--- Applying pending migrations ---');
  for (const migration of migrations) {
    await runner.applyMigration(migration);
    console.log(`  applied ${migration.version} ${migration.name}`);
  }

  await printStatus(runner, 'After applying migrations:');

  console.log('\n--- Rolling back is not supported by the runner (use each migration down) ---');
  // Demonstrate the down() of the last migration directly
  const down = migrations[migrations.length - 1]?.down;
  if (down) {
    const statements = down(undefined as unknown as never);
    console.log('  last migration down statements:', statements.length);
  }

  await printStatus(runner, 'Final status:');

  await driver.disconnect();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
