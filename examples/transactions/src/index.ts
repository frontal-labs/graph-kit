// index.ts - Atomic multi-step writes, rollback
// Run: pnpm start
// Requires Neo4j

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
    await client.raw("MATCH (n) WHERE n.id STARTS WITH 'tx-' DETACH DELETE n");

    // 1. Everything inside the callback commits together
    console.log('--- committing transaction ---');
    await client.transaction(async (tx) => {
      await tx.create<UserRow>('User', {
        data: { id: 'tx-author', name: 'Author', email: 'author@tx.example', age: 40 },
      });
      await tx.create<PostRow>('Post', {
        data: { id: 'tx-post-1', title: 'Atomic writes', published: true },
      });
      await tx.raw(
        `MATCH (u:User {id: $userId}), (p:Post {id: $postId})
         CREATE (u)-[:POSTED]->(p)`,
        { userId: 'tx-author', postId: 'tx-post-1' },
      );
    });
    const committed = await client.findUnique<PostRow & { author?: UserRow | null }>('Post', {
      where: { id: 'tx-post-1' },
      include: { author: true },
    });
    console.log('committed post author:', committed?.author?.name);

    // 2. If the callback throws, every write is rolled back
    console.log('\n--- rolling back a transaction ---');
    await client
      .transaction(async (tx) => {
        await tx.create<PostRow>('Post', {
          data: { id: 'tx-post-2', title: 'Never committed', published: false },
        });
        throw new Error('payment provider timed out');
      })
      .catch((error: Error) => console.log('rolled back because:', error.message));
    const rolledBack = await client.findUnique<PostRow>('Post', { where: { id: 'tx-post-2' } });
    console.log('tx-post-2 exists after rollback:', rolledBack !== null);

    // 3. Reads inside a transaction see the transaction's own uncommitted writes
    console.log('\n--- read uncommitted writes inside a transaction ---');
    const seen = await client.transaction(async (tx) => {
      await tx.create<PostRow>('Post', {
        data: { id: 'tx-post-3', title: 'Visible inside', published: true },
      });
      return tx.findMany<PostRow>('Post', { where: { id: { eq: 'tx-post-3' } } });
    });
    console.log(
      'visible inside transaction:',
      seen.map((p) => p.title),
    );
  } finally {
    await client.raw("MATCH (n) WHERE n.id STARTS WITH 'tx-' DETACH DELETE n");
    await driver.disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
