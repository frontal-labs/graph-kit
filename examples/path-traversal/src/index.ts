// index.ts - traverse(), shortestPath(), allShortestPaths()
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
    await client.raw("MATCH (n) WHERE n.id STARTS WITH 'pt-' DETACH DELETE n");

    const users = [
      { id: 'pt-alice', name: 'Alice' },
      { id: 'pt-bob', name: 'Bob' },
      { id: 'pt-carol', name: 'Carol' },
      { id: 'pt-dave', name: 'Dave' },
      { id: 'pt-eve', name: 'Eve' },
    ];
    for (const u of users) {
      await client.create<UserRow>('User', { data: u });
    }

    // Alice -> Bob -> Carol -> Dave, and Bob -> Eve
    await client.relate('User', 'pt-alice', 'FOLLOWS', 'User', 'pt-bob');
    await client.relate('User', 'pt-bob', 'FOLLOWS', 'User', 'pt-carol');
    await client.relate('User', 'pt-carol', 'FOLLOWS', 'User', 'pt-dave');
    await client.relate('User', 'pt-bob', 'FOLLOWS', 'User', 'pt-eve');

    console.log('--- traverse (variable-length path) ---');
    const network = await client.traverse('User', 'FOLLOWS', 'User', {
      fromId: 'pt-alice',
      maxDepth: 3,
    });
    console.log("Alice's network (up to 3 hops):", network.map((n) => String(n.name)).join(' -> '));

    console.log('\n--- shortestPath ---');
    const shortest = await client.findShortestPath('User', 'FOLLOWS', 'User', {
      fromId: 'pt-alice',
      toId: 'pt-dave',
      maxDepth: 5,
    });
    console.log('shortest path Alice->Dave:', shortest ? 'found' : 'not found');

    console.log('\n--- allShortestPaths ---');
    const all = await client.findAllShortestPaths('User', 'FOLLOWS', 'User', {
      fromId: 'pt-alice',
      toId: 'pt-dave',
      maxDepth: 5,
    });
    console.log(`all shortest paths Alice->Dave: ${all.length} path(s)`);
  } finally {
    await driver.disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
