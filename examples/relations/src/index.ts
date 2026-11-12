// index.ts - relate(), unrelate(), includes
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
    await client.raw("MATCH (n) WHERE n.id STARTS WITH 'rel-' DETACH DELETE n");

    await client.create<UserRow>('User', {
      data: { id: 'rel-alice', name: 'Alice', email: 'alice@example.com' },
    });
    await client.create<UserRow>('User', {
      data: { id: 'rel-bob', name: 'Bob', email: 'bob@example.com' },
    });
    await client.create<UserRow>('User', {
      data: { id: 'rel-carol', name: 'Carol', email: 'carol@example.com' },
    });
    await client.create<PostRow>('Post', {
      data: { id: 'rel-post-1', title: 'Hello Graph', published: true },
    });

    console.log('--- relate() ---');
    await client.relate('User', 'rel-alice', 'FOLLOWS', 'User', 'rel-bob');
    await client.relate('User', 'rel-alice', 'FOLLOWS', 'User', 'rel-carol');
    await client.relate('User', 'rel-bob', 'FOLLOWS', 'User', 'rel-carol');
    await client.relate('Post', 'rel-post-1', 'POSTED', 'User', 'rel-alice', 'IN');
    await client.relate('User', 'rel-bob', 'LIKES', 'Post', 'rel-post-1');
    await client.relate('User', 'rel-carol', 'LIKES', 'Post', 'rel-post-1');
    console.log('relationships created');

    console.log('\n--- includes: posts and author ---');
    const usersWithPosts = await client.findMany<UserRow & { posts?: PostRow[] }>('User', {
      include: { posts: true },
      limit: 10,
    });
    for (const u of usersWithPosts) {
      console.log(`  ${u.name}: ${u.posts?.map((p) => p.title).join(', ') ?? 'none'}`);
    }

    const postsWithAuthor = await client.findMany<PostRow & { author?: UserRow | null }>('Post', {
      include: { author: true },
    });
    for (const p of postsWithAuthor) {
      console.log(`  ${p.title} by ${p.author?.name ?? 'unknown'}`);
    }

    const postsWithLikers = await client.findMany<PostRow & { likedBy?: UserRow[] }>('Post', {
      where: { id: 'rel-post-1' },
      include: { likedBy: true },
    });
    console.log(
      'post-1 liked by:',
      postsWithLikers[0]?.likedBy?.map((u) => u.name).join(', ') ?? 'none',
    );

    console.log('\n--- unrelate() ---');
    await client.unrelate('User', 'rel-alice', 'FOLLOWS', 'User', 'rel-bob');
    const remaining = await client.raw(
      'MATCH (u:User {id: $id})-[:FOLLOWS]->(f:User) RETURN count(*) as count',
      { id: 'rel-alice' },
    );
    console.log('alice follows after unrelate bob:', remaining[0]?.count);
  } finally {
    await driver.disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
