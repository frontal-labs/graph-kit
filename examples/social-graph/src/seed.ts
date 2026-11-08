// seed.ts - Seed the social graph database

import { GraphClient } from '@graph-om/sdk';
import { createNeo4jDriver } from '@graph-om/sdk/driver/neo4j';
import { graph } from './schema.js';

const URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const USER = process.env.NEO4J_USER || 'neo4j';
const PASSWORD = process.env.NEO4J_PASSWORD || 'password';

async function seed() {
  const driver = createNeo4jDriver({ type: 'neo4j', uri: URI, username: USER, password: PASSWORD });
  await driver.connect();
  const client = new GraphClient(driver, graph);
  try {
    // Re-running the seed replaces the sample data instead of failing on unique ids
    await client.raw(
      "MATCH (n) WHERE n.id STARTS WITH 'user-' OR n.id STARTS WITH 'post-' DETACH DELETE n",
    );

    console.log('Seeding social graph...');

    // Create users
    const alice = await client.create('User', {
      data: { id: 'user-1', name: 'Alice', email: 'alice@example.com', age: 28 },
    });
    const bob = await client.create('User', {
      data: { id: 'user-2', name: 'Bob', email: 'bob@example.com', age: 32 },
    });
    const carol = await client.create('User', {
      data: { id: 'user-3', name: 'Carol', email: 'carol@example.com', age: 25 },
    });
    const dave = await client.create('User', {
      data: { id: 'user-4', name: 'Dave', email: 'dave@example.com', age: 30 },
    });

    console.log(`Created users: ${alice.name}, ${bob.name}, ${carol.name}, ${dave.name}`);

    // Create follow relationships
    await client.relate('User', 'user-1', 'FOLLOWS', 'User', 'user-2');
    await client.relate('User', 'user-1', 'FOLLOWS', 'User', 'user-3');
    await client.relate('User', 'user-2', 'FOLLOWS', 'User', 'user-3');
    await client.relate('User', 'user-3', 'FOLLOWS', 'User', 'user-4');
    await client.relate('User', 'user-4', 'FOLLOWS', 'User', 'user-1');

    console.log('Created follow relationships');

    // Create posts
    const _post1 = await client.create('Post', {
      data: {
        id: 'post-1',
        title: 'Graph Databases 101',
        content: 'Intro to graphs',
        published: true,
      },
    });
    const _post2 = await client.create('Post', {
      data: {
        id: 'post-2',
        title: 'Cypher Query Tips',
        content: 'Optimize your queries',
        published: true,
      },
    });
    const _post3 = await client.create('Post', {
      data: { id: 'post-3', title: 'Draft Post', content: 'Not yet published', published: false },
    });

    // Connect posts to authors
    await client.relate('Post', 'post-1', 'POSTED', 'User', 'user-1', 'IN');
    await client.relate('Post', 'post-2', 'POSTED', 'User', 'user-2', 'IN');
    await client.relate('Post', 'post-3', 'POSTED', 'User', 'user-1', 'IN');

    // Add likes
    await client.relate('User', 'user-2', 'LIKES', 'Post', 'post-1');
    await client.relate('User', 'user-3', 'LIKES', 'Post', 'post-1');
    await client.relate('User', 'user-1', 'LIKES', 'Post', 'post-2');

    console.log('Created posts and likes');

    console.log('Seed complete!');
  } finally {
    await driver.disconnect();
  }
}

seed().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
