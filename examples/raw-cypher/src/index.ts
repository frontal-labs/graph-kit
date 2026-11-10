// index.ts - Raw queries with parameters
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
    await client.raw("MATCH (n) WHERE n.id STARTS WITH 'raw-' DETACH DELETE n");

    await client.create<UserRow>('User', {
      data: { id: 'raw-alice', name: 'Alice', email: 'alice@example.com', age: 28 },
    });
    await client.create<UserRow>('User', {
      data: { id: 'raw-bob', name: 'Bob', email: 'bob@example.com', age: 32 },
    });
    await client.create<PostRow>('Post', {
      data: { id: 'raw-post-1', title: 'Graph Databases 101', published: true },
    });
    await client.create<PostRow>('Post', {
      data: { id: 'raw-post-2', title: 'Cypher Tips', published: true },
    });
    await client.relate('User', 'raw-alice', 'POSTED', 'Post', 'raw-post-1', 'IN');
    await client.relate('User', 'raw-bob', 'POSTED', 'Post', 'raw-post-2', 'IN');
    await client.relate('User', 'raw-bob', 'LIKES', 'Post', 'raw-post-1');

    console.log('--- raw query ---');
    const follows = await client.raw<{ follower: string; followed: string }>(
      'MATCH (u:User)-[:FOLLOWS]->(f:User) RETURN u.name AS follower, f.name AS followed',
    );
    for (const row of follows) {
      console.log(`  ${row.follower} follows ${row.followed}`);
    }

    console.log('\n--- raw query with parameters ---');
    const postCount = await client.raw<{ name: string; postCount: number }>(
      'MATCH (u:User {id: $id})-[:POSTED]->(p:Post) RETURN u.name AS name, count(p) AS postCount',
      { id: 'raw-alice' },
    );
    console.log(`alice post count: ${postCount[0]?.postCount}`);

    console.log('\n--- raw write via parameters ---');
    await client.raw('CREATE (u:User {id: $id, name: $name, email: $email, age: $age})', {
      id: 'raw-dana',
      name: 'Dana',
      email: 'dana@example.com',
      age: 27,
    });
    const dana = await client.findUnique<UserRow>('User', { where: { id: 'raw-dana' } });
    console.log('created via raw:', dana?.name, dana?.age);
  } finally {
    await driver.disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
