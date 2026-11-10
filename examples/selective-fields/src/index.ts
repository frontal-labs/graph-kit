// index.ts - select: { field: true } projection
// Run: pnpm start
// Requires Neo4j

import { GraphClient } from '@graph-kit/sdk';
import { createNeo4jDriver } from '@graph-kit/sdk/driver/neo4j';
import { graph, type UserRow } from './schema.js';

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
    await client.raw("MATCH (n) WHERE n.id STARTS WITH 'sel-' DETACH DELETE n");

    await client.create<UserRow>('User', {
      data: {
        id: 'sel-alice',
        name: 'Alice',
        email: 'alice@example.com',
        age: 28,
        bio: 'Engineer',
      },
    });
    await client.create<UserRow>('User', {
      data: { id: 'sel-bob', name: 'Bob', email: 'bob@example.com', age: 32, bio: 'Designer' },
    });
    await client.create<UserRow>('User', {
      data: { id: 'sel-carol', name: 'Carol', email: 'carol@example.com', age: 25, bio: 'PM' },
    });

    console.log('--- select only name and email ---');
    const selected = await client.findMany<UserRow>('User', {
      select: { name: true, email: true },
      limit: 3,
    });
    for (const u of selected) {
      console.log(`  ${u.name} <${u.email}> age=${u.age} bio=${u.bio}`);
    }

    console.log('\n--- select a single field ---');
    const names = await client.findMany<UserRow>('User', {
      select: { name: true },
      orderBy: { name: 'asc' },
    });
    console.log('names:', names.map((u) => u.name).join(', '));
  } finally {
    await driver.disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
