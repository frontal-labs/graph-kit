// migrations.ts - Migration Examples
// Demonstrates schema migrations with Graph-OM

import { GraphClient } from '@graph-om/core';
import { generateVersion, type Migration } from '@graph-om/migration';
import { createNeo4jDriver } from '@graph-om/neo4j';
import { graph } from './schema.js';

const URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const USER = process.env.NEO4J_USER || 'neo4j';
const PASSWORD = process.env.NEO4J_PASSWORD || 'password';

type UserRow = {
  id: string;
  name: string;
  email: string;
  age: number | null;
  createdAt: Date;
  bio?: string; // New field added in migration
  profileImageUrl?: string; // New field added in migration
};

type PostRow = {
  id: string;
  title: string;
  content: string | null;
  published: boolean;
  createdAt: Date;
  viewCount?: number; // New field added in migration
  tags?: string[]; // New field added in migration
};

async function main() {
  const driver = createNeo4jDriver({ uri: URI, username: USER, password: PASSWORD });
  await driver.connect();
  const _client = new GraphClient(driver, graph);

  console.log('=== MIGRATION EXAMPLES ===\n');

  // 1. Create initial migration
  console.log('--- Creating Initial Migration ---');
  const initialMigration: Migration = {
    version: generateVersion(),
    name: 'initial_schema',
    timestamp: Date.now(),
    up: (_compiler) => [
      // Create User node constraints and indexes
      `CREATE CONSTRAINT user_id_unique IF NOT EXISTS FOR (u:User) REQUIRE u.id IS UNIQUE`,
      `CREATE INDEX user_email_index IF NOT EXISTS FOR (u:User) ON (u.email)`,
      `CREATE INDEX user_name_index IF NOT EXISTS FOR (u:User) ON (u.name)`,

      // Create Post node constraints and indexes
      `CREATE CONSTRAINT post_id_unique IF NOT EXISTS FOR (p:Post) REQUIRE p.id IS UNIQUE`,
      `CREATE INDEX post_title_index IF NOT EXISTS FOR (p:Post) ON (p.title)`,
      `CREATE INDEX post_published_index IF NOT EXISTS FOR (p:Post) ON (p.published)`,
    ],
    down: (_compiler) => [
      `DROP CONSTRAINT user_id_unique IF EXISTS`,
      `DROP INDEX user_email_index IF EXISTS`,
      `DROP INDEX user_name_index IF EXISTS`,
      `DROP CONSTRAINT post_id_unique IF EXISTS`,
      `DROP INDEX post_title_index IF EXISTS`,
      `DROP INDEX post_published_index IF EXISTS`,
    ],
  };

  console.log('Initial migration:', initialMigration.name);
  console.log('Up statements:', initialMigration.up.length);
  console.log('Down statements:', initialMigration.down.length);

  // 2. Create migration to add bio field to User
  console.log('\n--- Adding Bio Field Migration ---');
  const addBioMigration: Migration = {
    version: generateVersion(),
    name: 'add_user_bio',
    timestamp: Date.now(),
    up: (_compiler) => [
      // Add bio property to existing User nodes
      `MATCH (u:User) WHERE u.bio IS NULL SET u.bio = ''`,
      // Add index for bio search
      `CREATE INDEX user_bio_index IF NOT EXISTS FOR (u:User) ON (u.bio)`,
    ],
    down: (_compiler) => [
      `DROP INDEX user_bio_index IF EXISTS`,
      // Note: Can't easily remove property in Neo4j, would need to set to null
      `MATCH (u:User) SET u.bio = null`,
    ],
  };

  console.log('Add bio migration:', addBioMigration.name);

  // 3. Create migration to add viewCount and tags to Post
  console.log('\n--- Adding Post Fields Migration ---');
  const addPostFieldsMigration: Migration = {
    version: generateVersion(),
    name: 'add_post_viewcount_tags',
    timestamp: Date.now(),
    up: (_compiler) => [
      // Add viewCount with default 0
      `MATCH (p:Post) WHERE p.viewCount IS NULL SET p.viewCount = 0`,
      // Add tags array (empty by default)
      `MATCH (p:Post) WHERE p.tags IS NULL SET p.tags = []`,
      // Index for viewCount
      `CREATE INDEX post_viewcount_index IF NOT EXISTS FOR (p:Post) ON (p.viewCount)`,
    ],
    down: (_compiler) => [
      `DROP INDEX post_viewcount_index IF EXISTS`,
      `MATCH (p:Post) SET p.viewCount = null, p.tags = null`,
    ],
  };

  console.log('Add post fields migration:', addPostFieldsMigration.name);

  // 4. Create migration to add profileImageUrl to User
  console.log('\n--- Adding Profile Image Migration ---');
  const addProfileImageMigration: Migration = {
    version: generateVersion(),
    name: 'add_user_profile_image',
    timestamp: Date.now(),
    up: (_compiler) => [
      `MATCH (u:User) WHERE u.profileImageUrl IS NULL SET u.profileImageUrl = ''`,
    ],
    down: (_compiler) => [`MATCH (u:User) SET u.profileImageUrl = null`],
  };

  console.log('Add profile image migration:', addProfileImageMigration.name);

  // 5. Create migration for new relationship type
  console.log('\n--- Adding New Relationship Type ---');
  const addBookmarkMigration: Migration = {
    version: generateVersion(),
    name: 'add_bookmark_relation',
    timestamp: Date.now(),
    up: (_compiler) => [
      // No schema changes needed for new relationship type
      // Relationships are dynamic in Neo4j
      // But we can add a constraint for the relationship if needed
      `CREATE CONSTRAINT bookmark_unique IF NOT EXISTS 
       FOR ()-[r:BOOKMARKED]-() REQUIRE r.id IS UNIQUE`,
    ],
    down: (_compiler) => [
      `DROP CONSTRAINT bookmark_unique IF EXISTS`,
      // Remove all BOOKMARKED relationships
      `MATCH ()-[r:BOOKMARKED]-() DELETE r`,
    ],
  };

  console.log('Add bookmark migration:', addBookmarkMigration.name);

  // 6. Create migration to rename a property
  console.log('\n--- Renaming Property Migration ---');
  const renameMigration: Migration = {
    version: generateVersion(),
    name: 'rename_content_to_body',
    timestamp: Date.now(),
    up: (_compiler) => [
      // Copy content to body
      `MATCH (p:Post) WHERE p.content IS NOT NULL AND p.body IS NULL 
       SET p.body = p.content`,
      // Verify all posts have body
      `MATCH (p:Post) WHERE p.body IS NULL SET p.body = ''`,
    ],
    down: (_compiler) => [
      // Copy body back to content
      `MATCH (p:Post) WHERE p.body IS NOT NULL AND p.content IS NULL 
       SET p.content = p.body`,
    ],
  };

  console.log('Rename content to body migration:', renameMigration.name);

  // 7. Create migration for data transformation
  console.log('\n--- Data Transformation Migration ---');
  const transformMigration: Migration = {
    version: generateVersion(),
    name: 'add_computed_fields',
    timestamp: Date.now(),
    up: (_compiler) => [
      // Add a computed field for user activity score
      `MATCH (u:User) 
       OPTIONAL MATCH (u)-[:POSTED]->(p:Post)
       OPTIONAL MATCH (u)-[:LIKES]->()
       SET u.activityScore = count(p) * 10 + count(DISTINCT (u)-[:LIKES]->())`,

      // Add post engagement score
      `MATCH (p:Post)
       OPTIONAL MATCH ()-[:LIKES]->(p)
       OPTIONAL MATCH ()-[:BOOKMARKED]->(p)
       SET p.engagementScore = count(DISTINCT (u:User)-[:LIKES]->(p)) * 5 + count(DISTINCT (u:User)-[:BOOKMARKED]->(p)) * 3`,
    ],
    down: (_compiler) => [
      `MATCH (u:User) SET u.activityScore = null`,
      `MATCH (p:Post) SET p.engagementScore = null`,
    ],
  };

  console.log('Computed fields migration:', transformMigration.name);

  // 8. Migration runner example
  console.log('\n--- Running Migrations with MigrationRunner ---');

  // In a real app, you would:
  // 1. Create a migrations directory with .ts files
  // 2. Use the MigrationRunner to apply migrations

  const _migrationsDir = './migrations';

  // Example of how to use MigrationRunner:
  /*
  const runner = createMigrationRunner({
    driver,
    migrationsDir,
    schema: graph,
  });

  // Apply all pending migrations
  const applied = await runner.migrate();
  console.log(`Applied ${applied.length} migrations:`);
  for (const m of applied) {
    console.log(`  - ${m.version}: ${m.name}`);
  }

  // Check status
  const status = await runner.status();
  console.log('\nMigration status:');
  for (const s of status) {
    console.log(`  ${s.applied ? '[x]' : '[ ]'} ${s.version}: ${s.name}`);
  }

  // Rollback last 2 migrations
  const rolledBack = await runner.rollback(2);
  console.log(`\nRolled back ${rolledBack.length} migrations`);
  */

  console.log('Migration runner configured (see comments for usage)');

  // 9. Schema diff migration (auto-generate from schema changes)
  console.log('\n--- Schema Diff Migration (Auto-generated) ---');

  // This would be generated by comparing old vs new schema
  const diffMigration: Migration = {
    version: generateVersion(),
    name: 'add_comment_node',
    timestamp: Date.now(),
    up: (_compiler) => [
      // Add Comment node
      `CREATE CONSTRAINT comment_id_unique IF NOT EXISTS FOR (c:Comment) REQUIRE c.id IS UNIQUE`,
      `CREATE INDEX comment_createdat_index IF NOT EXISTS FOR (c:Comment) ON (c.createdAt)`,

      // Add AUTHORS relationship from User to Comment
      `CREATE INDEX comment_author_index IF NOT EXISTS FOR ()-[r:AUTHORS]->() ON (r.createdAt)`,

      // Add ON_POST relationship from Comment to Post
      `CREATE INDEX comment_onpost_index IF NOT EXISTS FOR ()-[r:ON_POST]->() ON (r.createdAt)`,
    ],
    down: (_compiler) => [
      `DROP CONSTRAINT comment_id_unique IF EXISTS`,
      `DROP INDEX comment_createdat_index IF EXISTS`,
      `DROP INDEX comment_author_index IF EXISTS`,
      `DROP INDEX comment_onpost_index IF EXISTS`,
      // Remove all Comment nodes and relationships
      `MATCH (c:Comment) DETACH DELETE c`,
    ],
  };

  console.log('Add Comment node migration:', diffMigration.name);

  // 10. Migration best practices
  console.log('\n--- Migration Best Practices ---');
  console.log(`
1. Always test migrations on a copy of production data first
2. Keep migrations small and focused
3. Always provide down() for rollback capability
4. Use IF NOT EXISTS / IF EXISTS for idempotency
5. Run migrations in a transaction when possible
6. Version format: YYYYMMDDHHMMSS (e.g., 20240115143000)
7. Name format: snake_case_descriptive_name
8. Include timestamp for ordering
9. Document what each migration does
10. Consider migration order dependencies
  `);

  // 11. Example migration file structure
  console.log('\n--- Example Migration File Structure ---');
  console.log(`
migrations/
├── 20240115143000_initial_schema.ts
├── 20240116100000_add_user_bio.ts
├── 20240117120000_add_post_viewcount_tags.ts
├── 20240118150000_add_user_profile_image.ts
├── 20240119110000_add_bookmark_relation.ts
├── 20240120090000_rename_content_to_body.ts
├── 20240121130000_add_computed_fields.ts
└── 20240122160000_add_comment_node.ts
  `);

  // Example migration file content
  console.log('\n--- Example Migration File Content ---');
  console.log(`
// 20240115143000_initial_schema.ts
import { QueryCompiler } from '@graph-om/core/query';
import type { Migration } from '@graph-om/core/migration';

export const migration: Migration = {
  version: '20240115143000',
  name: 'initial_schema',
  timestamp: 1705329000000,
  
  up: (compiler: QueryCompiler) => {
    return [
      'CREATE CONSTRAINT user_id_unique IF NOT EXISTS FOR (u:User) REQUIRE u.id IS UNIQUE',
      'CREATE INDEX user_email_index IF NOT EXISTS FOR (u:User) ON (u.email)',
      'CREATE CONSTRAINT post_id_unique IF NOT EXISTS FOR (p:Post) REQUIRE p.id IS UNIQUE',
      'CREATE INDEX post_title_index IF NOT EXISTS FOR (p:Post) ON (p.title)',
    ];
  },
  
  down: (compiler: QueryCompiler) => {
    return [
      'DROP CONSTRAINT user_id_unique IF EXISTS',
      'DROP INDEX user_email_index IF EXISTS',
      'DROP CONSTRAINT post_id_unique IF EXISTS',
      'DROP INDEX post_title_index IF EXISTS',
    ];
  },
};
  `);

  await driver.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
