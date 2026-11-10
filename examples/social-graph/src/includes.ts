// includes.ts - Loading relations with `include`
// Run: pnpm start:includes

import { GraphClient } from '@graph-kit/sdk';
import { createNeo4jDriver } from '@graph-kit/sdk/driver/neo4j';
import { graph } from './schema.js';

const driver = createNeo4jDriver({
  type: 'neo4j',
  uri: process.env.NEO4J_URI ?? 'bolt://localhost:7687',
  username: process.env.NEO4J_USER ?? 'neo4j',
  password: process.env.NEO4J_PASSWORD ?? 'password',
});

type UserRow = {
  id: string;
  name: string;
  email: string;
  age: number | null;
};

type PostRow = {
  id: string;
  title: string;
  published: boolean;
};

async function seed(client: GraphClient) {
  // Remove anything left by a previous run of this example
  await client.raw("MATCH (n) WHERE n.id STARTS WITH 'inc-' DETACH DELETE n");

  await client.create<UserRow>('User', {
    data: { id: 'inc-alice', name: 'Alice', email: 'alice@inc.example', age: 28 },
  });
  await client.create<UserRow>('User', {
    data: { id: 'inc-bob', name: 'Bob', email: 'bob@inc.example', age: 32 },
  });
  await client.create<UserRow>('User', {
    data: { id: 'inc-carol', name: 'Carol', email: 'carol@inc.example', age: 25 },
  });

  await client.create<PostRow>('Post', {
    data: { id: 'inc-post-1', title: 'Graph DB Basics', published: true },
  });
  await client.create<PostRow>('Post', {
    data: { id: 'inc-post-2', title: 'Advanced Cypher', published: true },
  });

  // Authorship: User -[POSTED]-> Post
  await client.relate('User', 'inc-alice', 'POSTED', 'Post', 'inc-post-1');
  await client.relate('User', 'inc-alice', 'POSTED', 'Post', 'inc-post-2');

  // Follows: User -[FOLLOWS]-> User
  await client.relate('User', 'inc-alice', 'FOLLOWS', 'User', 'inc-bob');
  await client.relate('User', 'inc-alice', 'FOLLOWS', 'User', 'inc-carol');
  await client.relate('User', 'inc-bob', 'FOLLOWS', 'User', 'inc-carol');

  // Likes: User -[LIKES]-> Post
  await client.relate('User', 'inc-bob', 'LIKES', 'Post', 'inc-post-1');
}

async function main() {
  await driver.connect();
  const client = new GraphClient(driver, graph);
  try {
    await seed(client);

    // Relation loaded on a list query
    const users = await client.findMany<UserRow & { posts?: PostRow[] }>('User', {
      where: { id: { in: ['inc-alice', 'inc-bob'] } },
      orderBy: { name: 'asc' },
      include: { posts: true },
    });
    for (const user of users) {
      console.log(`${user.name} posted:`, user.posts?.map((p) => p.title) ?? []);
    }

    // Nested include: who Alice follows, and what they like
    const alice = await client.findUnique<
      UserRow & { following?: Array<UserRow & { likedPosts?: PostRow[] }> }
    >('User', {
      where: { id: 'inc-alice' },
      include: { following: { likedPosts: true } },
    });
    console.log(
      'Alice follows:',
      alice?.following?.map((u) => ({
        name: u.name,
        likes: u.likedPosts?.map((p) => p.title) ?? [],
      })),
    );

    // Relation loaded from the other side
    const post = await client.findUnique<
      PostRow & { author?: UserRow | null; likedBy?: UserRow[] }
    >('Post', {
      where: { id: 'inc-post-1' },
      include: { author: true, likedBy: true },
    });
    console.log(
      'Post 1 author:',
      post?.author?.name,
      'liked by:',
      post?.likedBy?.map((u) => u.name),
    );

    await client.raw("MATCH (n) WHERE n.id STARTS WITH 'inc-' DETACH DELETE n");
  } finally {
    await driver.disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
