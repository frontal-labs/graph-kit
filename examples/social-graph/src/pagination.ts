// pagination.ts - Offset, cursor, and paged-include examples
// Run: pnpm start:pagination

import { GraphClient } from '@graph-om/sdk';
import { createNeo4jDriver } from '@graph-om/sdk/driver/neo4j';
import { graph } from './schema.js';

const driver = createNeo4jDriver({
  type: 'neo4j',
  uri: process.env.NEO4J_URI ?? 'bolt://localhost:7687',
  username: process.env.NEO4J_USER ?? 'neo4j',
  password: process.env.NEO4J_PASSWORD ?? 'password',
});

type UserRow = { id: string; name: string; email: string; age: number | null };
type PostRow = { id: string; title: string; published: boolean; createdAt: Date };

async function seed(client: GraphClient) {
  await client.raw("MATCH (n) WHERE n.id STARTS WITH 'page-' DETACH DELETE n");

  for (let i = 1; i <= 10; i++) {
    await client.create<UserRow>('User', {
      data: {
        id: `page-user-${String(i).padStart(2, '0')}`,
        name: `User ${String(i).padStart(2, '0')}`,
        email: `user${i}@page.example`,
        age: 20 + i,
      },
    });
  }

  for (let i = 1; i <= 4; i++) {
    const id = `page-post-${i}`;
    await client.create<PostRow>('Post', {
      data: { id, title: `Post ${i}`, published: true },
    });
    await client.relate('User', 'page-user-01', 'POSTED', 'Post', id);
  }
  // Likes on the first two posts only, so the include shows both cases
  await client.relate('User', 'page-user-02', 'LIKES', 'Post', 'page-post-1');
  await client.relate('User', 'page-user-03', 'LIKES', 'Post', 'page-post-1');
  await client.relate('User', 'page-user-04', 'LIKES', 'Post', 'page-post-2');
}

async function main() {
  await driver.connect();
  const client = new GraphClient(driver, graph);

  try {
    await seed(client);
    const userFilter = { id: { startsWith: 'page-user-' } };

    // 1. Offset / limit pagination
    console.log('--- Offset/Limit ---');
    for (let page = 0; page < 4; page++) {
      const rows = await client.findMany<UserRow>('User', {
        where: userFilter,
        orderBy: { name: 'asc' },
        limit: 3,
        skip: page * 3,
      });
      console.log(`Page ${page + 1}:`, rows.map((u) => u.name).join(', ') || '(empty)');
    }

    // 2. Cursor pagination: keep the last id and ask for ids after it
    console.log('\n--- Cursor ---');
    let cursor: string | undefined;
    let pageNumber = 1;
    for (;;) {
      const rows = await client.findMany<UserRow>('User', {
        where: cursor ? { id: { startsWith: 'page-user-', gt: cursor } } : userFilter,
        orderBy: { id: 'asc' },
        limit: 3,
      });
      if (rows.length === 0) break;
      console.log(`Page ${pageNumber}:`, rows.map((u) => u.id).join(', '));
      cursor = rows[rows.length - 1]?.id;
      pageNumber++;
      if (rows.length < 3) break;
    }

    // 3. Total count to size the pages
    const total = await client.count('User', userFilter);
    console.log(`\nTotal users: ${total}, pages of 3: ${Math.ceil(total / 3)}`);

    // 4. Paged posts with their likers included
    console.log('\n--- Posts with likers ---');
    const posts = await client.findMany<PostRow & { likedBy?: UserRow[] }>('Post', {
      where: { id: { startsWith: 'page-post-' } },
      orderBy: { title: 'asc' },
      limit: 2,
      include: { likedBy: true },
    });
    for (const post of posts) {
      console.log(`  ${post.title}: ${post.likedBy?.length ?? 0} likes`);
    }
  } finally {
    await client.raw("MATCH (n) WHERE n.id STARTS WITH 'page-' DETACH DELETE n");
    await driver.disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
