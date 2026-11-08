// migrations.ts - Applying, checking, and rolling back migrations
// Run: pnpm start:migrations
//
// The migration modules are imported explicitly. `loadMigrations()` in @graph-om/sdk does not
// import files yet, so the list is built here from the files in ../migrations.

import { createNeo4jDriver } from '@graph-om/sdk/driver/neo4j';
import { createMigrationRunner, type Migration } from '@graph-om/sdk/migration';
import { migration as initialSchema } from '../migrations/20240115143000_initial_schema.js';
import { migration as addUserBio } from '../migrations/20240116100000_add_user_bio.js';
import { migration as addPostViewcountTags } from '../migrations/20240117120000_add_post_viewcount_tags.js';
import { migration as addUserProfileImage } from '../migrations/20240118150000_add_user_profile_image.js';
import { migration as addBookmarkRelation } from '../migrations/20240119110000_add_bookmark_relation.js';

const driver = createNeo4jDriver({
  type: 'neo4j',
  uri: process.env.NEO4J_URI ?? 'bolt://localhost:7687',
  username: process.env.NEO4J_USER ?? 'neo4j',
  password: process.env.NEO4J_PASSWORD ?? 'password',
});

const migrations: Migration[] = [
  initialSchema,
  addUserBio,
  addPostViewcountTags,
  addUserProfileImage,
  addBookmarkRelation,
];

async function printStatus(runner: ReturnType<typeof createMigrationRunner>, label: string) {
  const statuses = await runner.status(migrations);
  console.log(`\n${label}`);
  for (const status of statuses) {
    console.log(`  ${status.applied ? '[x]' : '[ ]'} ${status.version} ${status.name}`);
  }
}

async function main() {
  await driver.connect();

  try {
    const runner = createMigrationRunner({ driver, migrationsDir: './migrations' });

    await printStatus(runner, 'Before migrate:');

    const applied = await runner.migrate(migrations);
    console.log(`\nApplied ${applied.length} migration(s)`);

    await printStatus(runner, 'After migrate:');

    const rolledBack = await runner.rollback(migrations, 1);
    console.log(`\nRolled back ${rolledBack.map((m) => m.name).join(', ') || 'nothing'}`);

    await printStatus(runner, 'After rollback:');

    // Applying again is safe: only pending migrations run
    await runner.migrate(migrations);
    await printStatus(runner, 'Re-applied:');
  } finally {
    await driver.disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
