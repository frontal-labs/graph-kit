// index.ts - Social Graph Example
// Basic getting started example for Graph-OM
//
// For more comprehensive examples, see:
// - src/comprehensive.ts  - All features in one file
// - src/pagination.ts     - Pagination techniques
// - src/aggregations.ts   - Aggregation operations
// - src/includes.ts       - Complex relationship loading
// - src/transactions.ts   - Transaction patterns
// - src/graphql.ts        - GraphQL integration
// - src/testing.ts        - Testing with mock driver
// - src/migrations.ts     - Schema migrations
//
// Run examples with:
//   pnpm start:comprehensive
//   pnpm start:pagination
//   pnpm start:aggregations
//   pnpm start:includes
//   pnpm start:transactions
//   pnpm start:graphql
//   pnpm start:testing
//   pnpm start:migrations

import { GraphClient } from '@graph-om/core';
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
};

type PostRow = {
  id: string;
  title: string;
  content: string | null;
  published: boolean;
  createdAt: Date;
};

async function main() {
  const driver = createNeo4jDriver({ uri: URI, username: USER, password: PASSWORD });
  await driver.connect();
  const client = new GraphClient(driver, graph);

  // 1. Find all users
  const allUsers = await client.findMany<UserRow>('User', { limit: 10 });
  console.log(`\n1. All users (${allUsers.length}):`, allUsers.map((u) => u.name).join(', '));

  // 2. Find user by unique field
  const user = await client.findUnique<UserRow>('User', { where: { email: 'alice@example.com' } });
  console.log('\n2. Find Alice by email:', user?.name ?? 'Not found');

  // 3. Find users with filtering and ordering
  const youngUsers = await client.findMany<UserRow>('User', {
    where: { age: { gte: 25, lte: 32 } },
    orderBy: { age: 'desc' },
  });
  console.log(
    '\n3. Users aged 25-32 (by age desc):',
    youngUsers.map((u) => `${u.name} (${u.age})`).join(', '),
  );

  // 4. Count aggregate
  const totalUsers = await client.count('User');
  console.log(`\n4. Total users:`, totalUsers);

  // 5. Count with condition
  const adultCount = await client.count('User', { age: { gte: 30 } });
  console.log(`\n5. Users aged 30+:`, adultCount);

  // 6. Variable-length path traversal - follow chain up to 3 hops
  const network = await client.traverse('User', 'FOLLOWS', 'User', {
    fromId: 'user-1',
    maxDepth: 3,
  });
  console.log(
    `\n6. Alice's network (up to 3 hops):`,
    network.map((n) => String(n.name)).join(' -> '),
  );

  // 7. Update a user
  const updated = await client.update<UserRow>('User', {
    where: { id: 'user-1' },
    data: { age: 29 },
  });
  console.log(`\n7. Updated Alice age:`, updated.age);

  // 8. Upsert - create or update
  const upserted = await client.upsert<UserRow>('User', {
    where: { id: 'user-5' },
    create: { id: 'user-5', name: 'Eve', email: 'eve@example.com' },
    update: { name: 'Eve Updated' },
  });
  console.log(`\n8. Upserted Eve:`, upserted.name);

  // 9. Count published posts
  const publishedPosts = await client.count('Post', { published: true });
  console.log(`\n9. Published posts:`, publishedPosts);

  // 10. Raw Cypher query
  const rawResult = await client.raw<{ follower: string; followed: string }>(
    'MATCH (u:User)-[:FOLLOWS]->(f:User) RETURN u.name AS follower, f.name AS followed',
  );
  console.log('\n10. Follow relationships (raw query):');
  for (const row of rawResult) {
    console.log(`    ${row.follower} follows ${row.followed}`);
  }

  // 11. Transactional batch
  await client.transaction(async (tx) => {
    const txUser = await tx.findOne<UserRow>('User', { id: 'user-1' });
    console.log(`\n11. In transaction, found:`, txUser?.name);
  });

  // 12. Delete the upserted user
  await client.delete('User', { where: { id: 'user-5' } });
  console.log('\n12. Deleted upserted user (Eve)');

  // 13. Delete all relationships involving our test data
  await client.unrelate('User', 'user-1', 'FOLLOWS', 'User', 'user-2');

  console.log('\n--- All social graph examples completed ---\n');

  await driver.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
