// index.ts - Offset/limit and cursor pagination
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
    await client.raw("MATCH (n) WHERE n.id STARTS WITH 'pg-' DETACH DELETE n");

    for (let i = 1; i <= 6; i++) {
      await client.create<UserRow>('User', {
        data: { id: `pg-user-${i}`, name: `User ${i}`, email: `user${i}@example.com`, age: 20 + i },
      });
    }

    console.log('--- offset/limit pagination ---');
    const page1 = await client.findMany<UserRow>('User', {
      limit: 2,
      orderBy: { name: 'asc' },
    });
    console.log('page 1:', page1.map((u) => u.name).join(', '));

    const page2 = await client.findMany<UserRow>('User', {
      limit: 2,
      skip: 2,
      orderBy: { name: 'asc' },
    });
    console.log('page 2:', page2.map((u) => u.name).join(', '));

    const page3 = await client.findMany<UserRow>('User', {
      limit: 2,
      skip: 4,
      orderBy: { name: 'asc' },
    });
    console.log('page 3:', page3.map((u) => u.name).join(', '));

    console.log('\n--- cursor-based pagination (skip after last seen page) ---');
    const first = await client.findMany<UserRow>('User', {
      limit: 2,
      orderBy: { name: 'asc' },
    });
    const next = await client.findMany<UserRow>('User', {
      limit: 2,
      skip: 2,
      orderBy: { name: 'asc' },
    });
    console.log('first page:', first.map((u) => u.name).join(', '));
    console.log('next page:', next.map((u) => u.name).join(', '));
  } finally {
    await driver.disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
