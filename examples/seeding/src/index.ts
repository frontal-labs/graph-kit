// index.ts - SeedManager, factories, bulk insert
// Run: pnpm start
// Requires Neo4j

import { GraphClient } from '@graph-kit/sdk';
import { createNeo4jDriver } from '@graph-kit/sdk/driver/neo4j';
import { createSeedManager } from '@graph-kit/sdk/seed';
import { graph, type PostRow, type UserRow } from './schema.js';

const driver = createNeo4jDriver({
  type: 'neo4j',
  uri: process.env.NEO4J_URI ?? 'bolt://localhost:7687',
  username: process.env.NEO4J_USER ?? 'neo4j',
  password: process.env.NEO4J_PASSWORD ?? 'password',
});

async function main() {
  await driver.connect();
  const client = new GraphClient(driver, graph);

  try {
    await client.raw("MATCH (n) WHERE n.id STARTS WITH 'seed-' DETACH DELETE n");

    // Factories produce fixture data with optional overrides and an index.
    const userFactory = (overrides?: Partial<UserRow>, index = 0): UserRow => ({
      id: `seed-user-${index}`,
      name: overrides?.name ?? `User ${index}`,
      email: overrides?.email ?? `user${index}@example.com`,
      age: overrides?.age ?? 20 + index,
      createdAt: new Date(),
    });

    const postFactory = (overrides?: Partial<PostRow>, index = 0): PostRow => ({
      id: `seed-post-${index}`,
      title: overrides?.title ?? `Post ${index}`,
      published: overrides?.published ?? index % 2 === 0,
      createdAt: new Date(),
    });

    console.log('--- SeedManager with factories ---');
    const seedManager = createSeedManager({ driver, schema: graph });

    seedManager.registerFactory('User', userFactory);
    seedManager.registerFactory('Post', postFactory);

    // Clear and seed 5 users and 3 posts via factories.
    const results = await seedManager.seedWithFactories({
      User: 5,
      Post: 3,
    });
    console.log('seed results:', results.map((r) => `${r.label}: ${r.created} created`).join(', '));
    console.log('total users:', await client.count('User'));
    console.log('total posts:', await client.count('Post'));

    console.log('\n--- Bulk insert ---');
    const users = [1, 2, 3, 4, 5].map((i) => userFactory(undefined, i));
    const posts = [1, 2, 3].map((i) => postFactory(undefined, i));
    for (const u of users) {
      await client.create<UserRow>('User', { data: u });
    }
    for (const p of posts) {
      await client.create<PostRow>('Post', { data: p });
    }
    console.log('bulk inserted', users.length, 'users and', posts.length, 'posts');
    console.log('total users:', await client.count('User'));
    console.log('total posts:', await client.count('Post'));
  } finally {
    await driver.disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
