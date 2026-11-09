// index.ts - Switch between Neo4j, Memgraph, FalkorDB
// Run: pnpm start
// Neo4j requires a running instance; Memgraph/FalkorDB configs are shown for reference.

import { GraphClient } from '@graph-kit/sdk';
import { createNeo4jDriver } from '@graph-kit/sdk/driver/neo4j';
import { graph, type UserRow } from './schema.js';

function neo4jConfig() {
  return {
    type: 'neo4j' as const,
    uri: process.env.NEO4J_URI ?? 'bolt://localhost:7687',
    username: process.env.NEO4J_USER ?? 'neo4j',
    password: process.env.NEO4J_PASSWORD ?? 'password',
  };
}

function memgraphConfig() {
  return {
    type: 'memgraph' as const,
    host: 'localhost',
    port: 7687,
    username: process.env.MEMGRAPH_USER ?? '',
    password: process.env.MEMGRAPH_PASSWORD ?? '',
  };
}

function falkordbConfig() {
  return {
    type: 'falkordb' as const,
    host: 'localhost',
    port: 6379,
    username: process.env.FALKORDB_USER ?? '',
    password: process.env.FALKORDB_PASSWORD ?? '',
  };
}

async function runNeo4j() {
  console.log('\n=== Neo4j (live) ===');
  const driver = createNeo4jDriver(neo4jConfig());
  await driver.connect();
  const client = new GraphClient(driver, graph);
  try {
    await client.raw("MATCH (n) WHERE n.id STARTS WITH 'multi-' DETACH DELETE n");

    const alice = await client.create<UserRow>('User', {
      data: { id: 'multi-alice', name: 'Alice', email: 'alice@example.com', age: 28 },
    });
    console.log('created:', alice.name);

    const found = await client.findUnique<UserRow>('User', { where: { id: 'multi-alice' } });
    console.log('findUnique:', found?.name, 'age', found?.age);
  } finally {
    await client.raw("MATCH (n) WHERE n.id STARTS WITH 'multi-' DETACH DELETE n");
    await driver.disconnect();
  }
}

async function main() {
  console.log('--- Multi-driver: Neo4j (live) ---');
  await runNeo4j();

  console.log('\n--- Multi-driver: Memgraph (config only) ---');
  console.log('config:', JSON.stringify(memgraphConfig()));
  console.log(
    '(configure MEMGRAPH_USER / MEMGRAPH_PASSWORD and connect with createMemgraphDriver to run)',
  );

  console.log('\n--- Multi-driver: FalkorDB (config only) ---');
  console.log('config:', JSON.stringify(falkordbConfig()));
  console.log(
    '(configure FALKORDB_USER / FALKORDB_PASSWORD and connect with createFalkorDBDriver to run)',
  );

  console.log('\n--- createDriver registry ---');
  const { createDriver } = await import('@graph-kit/sdk/driver');
  console.log('drivers available via the createDriver() factory');

  console.log('\nMulti-driver example complete.');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
