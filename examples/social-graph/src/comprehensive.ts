// comprehensive.ts - Comprehensive Graph-Kit Examples
// Demonstrates all major features of the Graph-Kit library

import { GraphClient } from '@graph-kit/sdk';
import { createNeo4jDriver } from '@graph-kit/sdk/driver/neo4j';
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

type PostRow = {
  id: string;
  title: string;
  content: string | null;
  published: boolean;
  createdAt: Date;
};

async function main() {
  const driver = createNeo4jDriver({ type: 'neo4j', uri: URI, username: USER, password: PASSWORD });
  await driver.connect();
  const client = new GraphClient(driver, graph);

  // Start from a clean slate so the fixed ids below can be created again
  await client.raw(
    "MATCH (n) WHERE n.id STARTS WITH 'user-' OR n.id STARTS WITH 'post-' DETACH DELETE n",
  );

  console.log('=== COMPREHENSIVE GRAPH-KIT EXAMPLES ===\n');

  // ============================================================
  // BASIC CRUD OPERATIONS
  // ============================================================

  // 1. Create users
  console.log('--- Creating Users ---');
  const alice = await client.create<UserRow>('User', {
    data: { id: 'user-1', name: 'Alice', email: 'alice@example.com', age: 28 },
  });
  const bob = await client.create<UserRow>('User', {
    data: { id: 'user-2', name: 'Bob', email: 'bob@example.com', age: 32 },
  });
  const carol = await client.create<UserRow>('User', {
    data: { id: 'user-3', name: 'Carol', email: 'carol@example.com', age: 25 },
  });
  const dave = await client.create<UserRow>('User', {
    data: { id: 'user-4', name: 'Dave', email: 'dave@example.com', age: 30 },
  });
  console.log(`Created: ${alice.name}, ${bob.name}, ${carol.name}, ${dave.name}`);

  // 2. Find all users
  const allUsers = await client.findMany<UserRow>('User', { limit: 10 });
  console.log(`\nAll users (${allUsers.length}):`, allUsers.map((u) => u.name).join(', '));

  // 3. Find user by unique field
  const user = await client.findUnique<UserRow>('User', { where: { email: 'alice@example.com' } });
  console.log('\nFind Alice by email:', user?.name ?? 'Not found');

  // 4. Find users with filtering and ordering
  const youngUsers = await client.findMany<UserRow>('User', {
    where: { age: { gte: 25, lte: 32 } },
    orderBy: { age: 'desc' },
  });
  console.log(
    '\nUsers aged 25-32 (by age desc):',
    youngUsers.map((u) => `${u.name} (${u.age})`).join(', '),
  );

  // 5. Count aggregate
  const totalUsers = await client.count('User');
  console.log(`\nTotal users:`, totalUsers);

  // 6. Count with condition
  const adultCount = await client.count('User', { age: { gte: 30 } });
  console.log(`\nUsers aged 30+:`, adultCount);

  // 7. Update a user
  const updated = await client.update<UserRow>('User', {
    where: { id: 'user-1' },
    data: { age: 29 },
  });
  console.log(`\nUpdated Alice age:`, updated.age);

  // 8. Upsert - create or update
  const upserted = await client.upsert<UserRow>('User', {
    where: { id: 'user-5' },
    create: { id: 'user-5', name: 'Eve', email: 'eve@example.com' },
    update: { name: 'Eve Updated' },
  });
  console.log(`\nUpserted Eve:`, upserted.name);

  // ============================================================
  // RELATIONSHIPS
  // ============================================================

  console.log('\n--- Creating Relationships ---');

  // Create follow relationships
  await client.relate('User', 'user-1', 'FOLLOWS', 'User', 'user-2');
  await client.relate('User', 'user-1', 'FOLLOWS', 'User', 'user-3');
  await client.relate('User', 'user-2', 'FOLLOWS', 'User', 'user-3');
  await client.relate('User', 'user-3', 'FOLLOWS', 'User', 'user-4');
  await client.relate('User', 'user-4', 'FOLLOWS', 'User', 'user-1');
  console.log('Created follow relationships');

  // Create posts
  const _post1 = await client.create<PostRow>('Post', {
    data: {
      id: 'post-1',
      title: 'Graph Databases 101',
      content: 'Intro to graphs',
      published: true,
    },
  });
  const _post2 = await client.create<PostRow>('Post', {
    data: {
      id: 'post-2',
      title: 'Cypher Query Tips',
      content: 'Optimize your queries',
      published: true,
    },
  });
  const _post3 = await client.create<PostRow>('Post', {
    data: { id: 'post-3', title: 'Draft Post', content: 'Not yet published', published: false },
  });

  // Connect posts to authors (POSTED relationship - IN direction from Post to User)
  await client.relate('Post', 'post-1', 'POSTED', 'User', 'user-1', 'IN');
  await client.relate('Post', 'post-2', 'POSTED', 'User', 'user-2', 'IN');
  await client.relate('Post', 'post-3', 'POSTED', 'User', 'user-1', 'IN');

  // Add likes
  await client.relate('User', 'user-2', 'LIKES', 'Post', 'post-1');
  await client.relate('User', 'user-3', 'LIKES', 'Post', 'post-1');
  await client.relate('User', 'user-1', 'LIKES', 'Post', 'post-2');

  console.log('Created posts and likes');

  // ============================================================
  // COMPLEX QUERIES WITH INCLUDES
  // ============================================================

  console.log('\n--- Complex Queries with Includes ---');

  // 9. Find users with their posts
  const usersWithPosts = await client.findMany<UserRow & { posts?: PostRow[] }>('User', {
    include: { posts: true },
    limit: 10,
  });
  console.log('\nUsers with their posts:');
  for (const u of usersWithPosts) {
    console.log(`  ${u.name}: ${u.posts?.map((p) => p.title).join(', ') ?? 'none'}`);
  }

  // 10. Find user with nested includes (posts and their likes)
  const userWithFullGraph = await client.findUnique<
    UserRow & { posts?: Array<PostRow & { likedBy?: UserRow[] }>; following?: UserRow[] }
  >('User', {
    where: { id: 'user-1' },
    include: {
      posts: {
        include: { likedBy: true },
      },
      following: true,
    },
  });
  console.log('\nAlice with posts (including likes) and following:');
  console.log(`  Name: ${userWithFullGraph?.name}`);
  console.log(`  Posts: ${userWithFullGraph?.posts?.map((p) => p.title).join(', ')}`);
  console.log(`  Following: ${userWithFullGraph?.following?.map((u) => u.name).join(', ')}`);

  // 11. Find posts with author
  const postsWithAuthor = await client.findMany<PostRow & { author?: UserRow | null }>('Post', {
    include: { author: true },
    where: { published: true },
  });
  console.log('\nPublished posts with authors:');
  for (const p of postsWithAuthor) {
    console.log(`  ${p.title} by ${p.author?.name}`);
  }

  // ============================================================
  // VARIABLE-LENGTH PATH TRAVERSAL
  // ============================================================

  console.log('\n--- Variable-Length Path Traversal ---');

  // 12. Follow chain up to 3 hops
  const network = await client.traverse('User', 'FOLLOWS', 'User', {
    fromId: 'user-1',
    maxDepth: 3,
  });
  console.log(`\nAlice's network (up to 3 hops):`, network.map((n) => String(n.name)).join(' -> '));

  // 13. Shortest path between users
  const shortestPath = await client.findShortestPath('User', 'FOLLOWS', 'User', {
    fromId: 'user-1',
    toId: 'user-4',
    maxDepth: 5,
  });
  console.log('\nShortest path from Alice to Dave:', shortestPath ? 'Found' : 'Not found');

  // 14. All shortest paths
  const allShortestPaths = await client.findAllShortestPaths('User', 'FOLLOWS', 'User', {
    fromId: 'user-1',
    toId: 'user-4',
    maxDepth: 5,
  });
  console.log(`\nAll shortest paths from Alice to Dave: ${allShortestPaths.length} path(s)`);

  // ============================================================
  // AGGREGATIONS
  // ============================================================

  console.log('\n--- Aggregations ---');

  // 15. Count published posts
  const publishedPosts = await client.count('Post', { published: true });
  console.log(`\nPublished posts:`, publishedPosts);

  // 16. Average age
  const avgAge = await client.aggregate('User', 'avg', 'age');
  console.log(`\nAverage user age:`, avgAge);

  // 17. Min/max age
  const minAge = await client.aggregate('User', 'min', 'age');
  const maxAge = await client.aggregate('User', 'max', 'age');
  console.log(`\nAge range: ${minAge} - ${maxAge}`);

  // ============================================================
  // RAW CYPHER QUERIES
  // ============================================================

  console.log('\n--- Raw Cypher Queries ---');

  // 18. Raw query for follow relationships
  const rawResult = await client.raw<{ follower: string; followed: string }>(
    'MATCH (u:User)-[:FOLLOWS]->(f:User) RETURN u.name AS follower, f.name AS followed',
  );
  console.log('\nFollow relationships (raw query):');
  for (const row of rawResult) {
    console.log(`  ${row.follower} follows ${row.followed}`);
  }

  // 19. Raw query with parameters
  const paramResult = await client.raw<{ name: string; postCount: number }>(
    'MATCH (u:User {id: $id})-[:POSTED]->(p:Post) RETURN u.name AS name, count(p) AS postCount',
    { id: 'user-1' },
  );
  console.log('\nAlice post count (param query):', paramResult[0]?.postCount);

  // ============================================================
  // TRANSACTIONS
  // ============================================================

  console.log('\n--- Transactions ---');

  // 20. Transactional batch
  await client.transaction(async (tx) => {
    const txUser = await tx.findOne<UserRow>('User', { id: 'user-1' });
    console.log(`\nIn transaction, found:`, txUser?.name);

    // Create a new post within transaction
    const newPost = await tx.create<PostRow>('Post', {
      data: {
        id: 'post-tx-1',
        title: 'Transactional Post',
        content: 'Created in tx',
        published: true,
      },
    });
    console.log(`Created post in transaction:`, newPost.title);

    // Relate it to Alice
    await tx.raw('MATCH (p:Post {id: $postId}), (u:User {id: $userId}) CREATE (u)-[:POSTED]->(p)', {
      postId: newPost.id,
      userId: 'user-1',
    });
  });

  // 21. Read transaction
  const readTxResult = await client.transaction(async (tx) => {
    return tx.findMany<UserRow>('User', { limit: 5 });
  });
  console.log(`\nRead transaction found ${readTxResult.length} users`);

  // ============================================================
  // PAGINATION
  // ============================================================

  console.log('\n--- Pagination ---');

  // 22. Cursor-based pagination
  const page1 = await client.findMany<UserRow>('User', {
    limit: 2,
    orderBy: { name: 'asc' },
  });
  console.log('\nPage 1:', page1.map((u) => u.name).join(', '));

  const page2 = await client.findMany<UserRow>('User', {
    limit: 2,
    skip: 2,
    orderBy: { name: 'asc' },
  });
  console.log('Page 2:', page2.map((u) => u.name).join(', '));

  // ============================================================
  // SELECTIVE FIELDS
  // ============================================================

  console.log('\n--- Selective Fields ---');

  // 23. Select only specific fields
  const selectedFields = await client.findMany<UserRow>('User', {
    select: { name: true, email: true },
    limit: 3,
  });
  console.log('\nSelected fields (name, email):');
  for (const u of selectedFields) {
    console.log(`  ${u.name} <${u.email}>`);
  }

  // ============================================================
  // DELETE OPERATIONS
  // ============================================================

  console.log('\n--- Delete Operations ---');

  // 24. Delete the upserted user
  await client.delete('User', { where: { id: 'user-5' } });
  console.log('\nDeleted upserted user (Eve)');

  // 25. Unrelate - delete relationship
  await client.unrelate('User', 'user-1', 'FOLLOWS', 'User', 'user-2');
  console.log('Removed Alice follows Bob relationship');

  // 26. Verify deletion
  const remainingFollows = await client.raw(
    'MATCH (u:User {id: "user-1"})-[:FOLLOWS]->(f:User) RETURN count(*) as count',
  );
  console.log('Remaining follows for Alice:', remainingFollows[0]?.count);

  console.log('\n=== ALL COMPREHENSIVE EXAMPLES COMPLETED ===\n');

  await driver.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
