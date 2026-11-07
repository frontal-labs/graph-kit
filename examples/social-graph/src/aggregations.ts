// aggregations.ts - Aggregation Examples
// Demonstrates various aggregation operations with Graph-OM

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

type PostRow = {
  id: string;
  title: string;
  content: string | null;
  published: boolean;
  createdAt: Date;
};

async function main() {
  const driver = createNeo4jDriver({ uri: URI, username: USER, password: PASSWORD });
  await driver.connect();
  const client = new GraphClient(driver, graph);

  console.log('=== AGGREGATION EXAMPLES ===\n');

  // Create test data
  for (let i = 1; i <= 5; i++) {
    await client.upsert<UserRow>('User', {
      where: { id: `agg-user-${i}` },
      create: {
        id: `agg-user-${i}`,
        name: `User ${i}`,
        email: `agguser${i}@example.com`,
        age: 20 + i * 5,
      },
      update: {},
    });
  }

  // Create posts for user-1
  for (let i = 1; i <= 3; i++) {
    await client.upsert<PostRow>('Post', {
      where: { id: `agg-post-${i}` },
      create: { id: `agg-post-${i}`, title: `Post ${i}`, content: 'Content', published: true },
      update: {},
    });
    await client.relate('Post', `agg-post-${i}`, 'POSTED', 'User', 'agg-user-1', 'IN');
  }

  // Create posts for user-2
  for (let i = 4; i <= 5; i++) {
    await client.upsert<PostRow>('Post', {
      where: { id: `agg-post-${i}` },
      create: { id: `agg-post-${i}`, title: `Post ${i}`, content: 'Content', published: false },
      update: {},
    });
    await client.relate('Post', `agg-post-${i}`, 'POSTED', 'User', 'agg-user-2', 'IN');
  }

  console.log('--- Basic Count Aggregations ---');

  // 1. Total count
  const totalUsers = await client.count('User');
  console.log(`Total users: ${totalUsers}`);

  // 2. Conditional count
  const adultUsers = await client.count('User', { age: { gte: 30 } });
  console.log(`Users aged 30+: ${adultUsers}`);

  // 3. Count with multiple conditions
  const youngAdults = await client.count('User', {
    age: { gte: 25, lte: 35 },
  });
  console.log(`Users aged 25-35: ${youngAdults}`);

  // 4. Count posts by published status
  const publishedPosts = await client.count('Post', { published: true });
  const draftPosts = await client.count('Post', { published: false });
  console.log(`Published posts: ${publishedPosts}, Draft posts: ${draftPosts}`);

  console.log('\n--- Numeric Aggregations ---');

  // 5. Average age
  const avgAge = await client.aggregate('User', 'avg', 'age');
  console.log(`Average user age: ${avgAge.toFixed(1)}`);

  // 6. Min/Max age
  const minAge = await client.aggregate('User', 'min', 'age');
  const maxAge = await client.aggregate('User', 'max', 'age');
  console.log(`Age range: ${minAge} - ${maxAge}`);

  // 7. Sum of ages
  const sumAge = await client.aggregate('User', 'sum', 'age');
  console.log(`Sum of all ages: ${sumAge}`);

  // 8. Aggregations with where clause
  const avgAdultAge = await client.aggregate('User', 'avg', 'age', { age: { gte: 30 } });
  console.log(`Average age of adults (30+): ${avgAdultAge.toFixed(1)}`);

  console.log('\n--- Aggregations with Relationships ---');

  // 9. Count posts per user (using raw query for group by)
  const postsPerUser = await client.raw<{ author: string; postCount: number }>(
    `MATCH (u:User)-[:POSTED]->(p:Post)
     WHERE u.id STARTS WITH 'agg-user-'
     RETURN u.name AS author, count(p) AS postCount
     ORDER BY postCount DESC`,
  );
  console.log('\nPosts per user:');
  for (const row of postsPerUser) {
    console.log(`  ${row.author}: ${row.postCount} posts`);
  }

  // 10. Count likes per post
  const likesPerPost = await client.raw<{ title: string; likeCount: number }>(
    `MATCH (p:Post)<-[:LIKES]-(u:User)
     WHERE p.id STARTS WITH 'agg-post-'
     RETURN p.title AS title, count(u) AS likeCount`,
  );
  console.log('\nLikes per post:');
  for (const row of likesPerPost) {
    console.log(`  ${row.title}: ${row.likeCount} likes`);
  }

  // 11. Complex aggregation: users with post count and avg age
  const userStats = await client.raw<{ name: string; postCount: number; avgAge: number }>(
    `MATCH (u:User)
     WHERE u.id STARTS WITH 'agg-user-'
     OPTIONAL MATCH (u)-[:POSTED]->(p:Post)
     RETURN u.name AS name, count(p) AS postCount, avg(u.age) AS avgAge`,
  );
  console.log('\nUser stats (posts + avg age):');
  for (const row of userStats) {
    console.log(
      `  ${row.name}: ${row.postCount} posts, avg age ${row.avgAge?.toFixed(1) ?? 'N/A'}`,
    );
  }

  console.log('\n--- Aggregation in Transactions ---');

  // 12. Transaction with aggregations
  const txResult = await client.transaction(async (tx) => {
    const count = await tx.count('User', { id: { startsWith: 'agg-user-' } });
    const avg = await tx.aggregate('User', 'avg', 'age', { id: { startsWith: 'agg-user-' } });
    return { count, avgAge: avg };
  });
  console.log(`\nIn transaction: ${txResult.count} users, avg age ${txResult.avgAge.toFixed(1)}`);

  await driver.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
