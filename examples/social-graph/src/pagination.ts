// pagination.ts - Pagination Examples
// Demonstrates various pagination techniques with Graph-OM

import { GraphClient } from '@graph-om/core';
import { createNeo4jDriver } from '@graph-om/neo4j';
import { graph } from './schema.js';

const URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const USER = process.env.NEO4J_USER || 'neo4j';
const PASSWORD = process.env.NEO4J_PASSWORD || 'password';

type UserRow = {
  id: string;
  name: string;
  email: string;
  age: number | null;
  createdAt: Date;
};

async function main() {
  const driver = createNeo4jDriver({ uri: URI, username: USER, password: PASSWORD });
  await driver.connect();
  const client = new GraphClient(driver, graph);

  console.log('=== PAGINATION EXAMPLES ===\n');

  // Create test users if needed
  for (let i = 1; i <= 10; i++) {
    await client.upsert<UserRow>('User', {
      where: { id: `page-user-${i}` },
      create: {
        id: `page-user-${i}`,
        name: `User ${i}`,
        email: `user${i}@example.com`,
        age: 20 + i,
      },
      update: {},
    });
  }

  // 1. Basic offset/limit pagination
  console.log('--- Offset/Limit Pagination ---');
  const page1 = await client.findMany<UserRow>('User', {
    where: { id: { startsWith: 'page-user-' } },
    limit: 3,
    orderBy: { name: 'asc' },
  });
  console.log('Page 1:', page1.map((u) => u.name).join(', '));

  const page2 = await client.findMany<UserRow>('User', {
    where: { id: { startsWith: 'page-user-' } },
    limit: 3,
    skip: 3,
    orderBy: { name: 'asc' },
  });
  console.log('Page 2:', page2.map((u) => u.name).join(', '));

  const page3 = await client.findMany<UserRow>('User', {
    where: { id: { startsWith: 'page-user-' } },
    limit: 3,
    skip: 6,
    orderBy: { name: 'asc' },
  });
  console.log('Page 3:', page3.map((u) => u.name).join(', '));

  // 2. Cursor-based pagination (using where with id > lastId)
  console.log('\n--- Cursor-based Pagination ---');
  let lastId: string | null = null;
  let hasMore = true;
  let pageNum = 1;

  while (hasMore) {
    const where: any = { id: { startsWith: 'page-user-' } };
    if (lastId) {
      where.id = { ...where.id, gt: lastId };
    }

    const results = await client.findMany<UserRow>('User', {
      where,
      limit: 3,
      orderBy: { id: 'asc' },
    });

    if (results.length === 0) {
      hasMore = false;
      break;
    }

    console.log(`Page ${pageNum}:`, results.map((u) => u.name).join(', '));
    lastId = results[results.length - 1].id;
    pageNum++;

    if (results.length < 3) hasMore = false;
  }

  // 3. Count total for pagination info
  const totalCount = await client.count('User', { id: { startsWith: 'page-user-' } });
  console.log(`\nTotal users: ${totalCount}`);
  console.log(`Pages needed (limit 3): ${Math.ceil(totalCount / 3)}`);

  // 4. Pagination with includes
  console.log('\n--- Pagination with Includes ---');
  const postsWithLikes = await client.findMany('Post', {
    include: { likedBy: true },
    limit: 2,
    orderBy: { createdAt: 'desc' },
  });
  console.log('Posts with likes (2 per page):');
  for (const post of postsWithLikes) {
    console.log(`  ${post.title} - ${post.likedBy?.length ?? 0} likes`);
  }

  await driver.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
