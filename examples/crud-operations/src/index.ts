// index.ts - Create, read, update, delete, upsert
// Run: pnpm start
// Requires Neo4j (docker compose up -d)

import { GraphClient } from '@graph-kit/sdk';
import { createNeo4jDriver } from '@graph-kit/sdk/driver/neo4j';
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
    await client.raw("MATCH (n) WHERE n.id STARTS WITH 'crud-' DETACH DELETE n");

    // --- Create ---
    console.log('--- Create ---');
    const alice = await client.create<UserRow>('User', {
      data: { id: 'crud-alice', name: 'Alice', email: 'alice@example.com', age: 28 },
    });
    const bob = await client.create<UserRow>('User', {
      data: { id: 'crud-bob', name: 'Bob', email: 'bob@example.com', age: 32 },
    });
    console.log('created users:', alice.name, bob.name);

    const post = await client.create<PostRow>('Post', {
      data: {
        id: 'crud-post-1',
        title: 'Graph Databases 101',
        content: 'Intro to graphs',
        published: true,
      },
    });
    console.log('created post:', post.title);

    // --- Read ---
    console.log('\n--- Read ---');
    const found = await client.findUnique<UserRow>('User', { where: { id: 'crud-alice' } });
    console.log('findUnique:', found?.name, 'age', found?.age);

    const byEmail = await client.findUnique<UserRow>('User', {
      where: { email: 'bob@example.com' },
    });
    console.log('find by email:', byEmail?.name);

    const all = await client.findMany<UserRow>('User', { limit: 10 });
    console.log('findMany count:', all.length);

    // --- Update ---
    console.log('\n--- Update ---');
    const updated = await client.update<UserRow>('User', {
      where: { id: 'crud-alice' },
      data: { age: 29 },
    });
    console.log('updated alice age:', updated.age);

    // --- Upsert ---
    console.log('\n--- Upsert ---');
    const upserted = await client.upsert<UserRow>('User', {
      where: { id: 'crud-carol' },
      create: { id: 'crud-carol', name: 'Carol', email: 'carol@example.com' },
      update: { name: 'Carol Updated' },
    });
    console.log('upserted:', upserted.name);

    const upsertedAgain = await client.upsert<UserRow>('User', {
      where: { id: 'crud-carol' },
      create: { id: 'crud-carol', name: 'Carol', email: 'carol@example.com' },
      update: { age: 31 },
    });
    console.log('upsert again (updated):', upsertedAgain.name, 'age', upsertedAgain.age);

    // --- Count ---
    console.log('\n--- Count ---');
    console.log('total users:', await client.count('User'));
    console.log('adults:', await client.count('User', { age: { gte: 30 } }));

    // --- Delete ---
    console.log('\n--- Delete ---');
    await client.delete<UserRow>('User', { where: { id: 'crud-carol' } });
    const gone = await client.findUnique<UserRow>('User', { where: { id: 'crud-carol' } });
    console.log('carol after delete:', gone);
  } finally {
    await driver.disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
