// includes.ts - Complex Includes/Relations Examples
// Demonstrates advanced relationship loading and nested includes with Graph-OM

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

  console.log('=== COMPLEX INCLUDES/RELATIONS EXAMPLES ===\n');

  // Create test data
  const _alice = await client.upsert<UserRow>('User', {
    where: { id: 'inc-user-1' },
    create: { id: 'inc-user-1', name: 'Alice', email: 'alice@example.com', age: 28 },
    update: {},
  });
  const _bob = await client.upsert<UserRow>('User', {
    where: { id: 'inc-user-2' },
    create: { id: 'inc-user-2', name: 'Bob', email: 'bob@example.com', age: 32 },
    update: {},
  });
  const _carol = await client.upsert<UserRow>('User', {
    where: { id: 'inc-user-3' },
    create: { id: 'inc-user-3', name: 'Carol', email: 'carol@example.com', age: 25 },
    update: {},
  });

  // Create posts
  const _post1 = await client.upsert<PostRow>('Post', {
    where: { id: 'inc-post-1' },
    create: { id: 'inc-post-1', title: 'Graph DB Basics', content: 'Intro', published: true },
    update: {},
  });
  const _post2 = await client.upsert<PostRow>('Post', {
    where: { id: 'inc-post-2' },
    create: { id: 'inc-post-2', title: 'Advanced Cypher', content: 'Deep dive', published: true },
    update: {},
  });
  const _post3 = await client.upsert<PostRow>('Post', {
    where: { id: 'inc-post-3' },
    create: { id: 'inc-post-3', title: 'Draft Post', content: 'WIP', published: false },
    update: {},
  });

  // Connect posts to authors
  await client.relate('Post', 'inc-post-1', 'POSTED', 'User', 'inc-user-1', 'IN');
  await client.relate('Post', 'inc-post-2', 'POSTED', 'User', 'inc-user-1', 'IN');
  await client.relate('Post', 'inc-post-3', 'POSTED', 'User', 'inc-user-2', 'IN');

  // Create follows
  await client.relate('User', 'inc-user-1', 'FOLLOWS', 'User', 'inc-user-2');
  await client.relate('User', 'inc-user-1', 'FOLLOWS', 'User', 'inc-user-3');
  await client.relate('User', 'inc-user-2', 'FOLLOWS', 'User', 'inc-user-3');

  // Create likes
  await client.relate('User', 'inc-user-2', 'LIKES', 'Post', 'inc-post-1');
  await client.relate('User', 'inc-user-3', 'LIKES', 'Post', 'inc-post-1');
  await client.relate('User', 'inc-user-1', 'LIKES', 'Post', 'inc-post-2');

  console.log('--- Single Level Includes ---');

  // 1. Basic include - user with posts
  const userWithPosts = await client.findUnique<UserRow>('User', {
    where: { id: 'inc-user-1' },
    include: { posts: true },
  });
  console.log('\nAlice with posts:');
  console.log(`  Name: ${userWithPosts?.name}`);
  console.log(`  Posts: ${userWithPosts?.posts?.map((p: any) => p.title).join(', ')}`);

  // 2. Include with multiple relations
  const userWithAll = await client.findUnique<UserRow>('User', {
    where: { id: 'inc-user-1' },
    include: { posts: true, following: true, likedPosts: true },
  });
  console.log('\nAlice with all relations:');
  console.log(`  Posts: ${userWithAll?.posts?.length ?? 0}`);
  console.log(`  Following: ${userWithAll?.following?.length ?? 0}`);
  console.log(`  Liked posts: ${userWithAll?.likedPosts?.length ?? 0}`);

  console.log('\n--- Nested Includes (Multi-level) ---');

  // 3. Nested include - posts with their authors
  const postsWithAuthors = await client.findMany<PostRow>('Post', {
    where: { id: { startsWith: 'inc-post-' } },
    include: { author: true },
  });
  console.log('\nPosts with authors:');
  for (const p of postsWithAuthors) {
    console.log(`  ${p.title} by ${p.author?.name}`);
  }

  // 4. Deep nested include - users with posts and posts' likes
  const deepNested = await client.findUnique<UserRow>('User', {
    where: { id: 'inc-user-1' },
    include: {
      posts: {
        include: { likedBy: true },
      },
    },
  });
  console.log('\nAlice with posts (including who liked each post):');
  for (const post of deepNested?.posts ?? []) {
    const likers = post.likedBy?.map((u: any) => u.name).join(', ') ?? 'none';
    console.log(`  ${post.title} - liked by: ${likers}`);
  }

  console.log('\n--- Include with Filtering ---');

  // 5. Include with where clause on parent
  const publishedPostsOnly = await client.findMany<UserRow>('User', {
    include: { posts: true },
    where: { id: { startsWith: 'inc-user-' } },
  });
  console.log('\nUsers with their published posts:');
  for (const u of publishedPostsOnly) {
    const pubPosts = u.posts?.filter((p: any) => p.published) ?? [];
    console.log(`  ${u.name}: ${pubPosts.map((p: any) => p.title).join(', ') || 'none'}`);
  }

  // 6. Include with limit on relation (using raw query approach)
  console.log('\n--- Include Multiple Levels ---');

  // 7. User -> Following -> Their Posts (3 levels deep)
  const networkWithPosts = await client.findUnique<UserRow>('User', {
    where: { id: 'inc-user-1' },
    include: {
      following: {
        include: { posts: true },
      },
    },
  });
  console.log('\nAlice -> Following -> Their Posts:');
  for (const followed of networkWithPosts?.following ?? []) {
    console.log(
      `  ${followed.name} posts: ${followed.posts?.map((p: any) => p.title).join(', ') || 'none'}`,
    );
  }

  console.log('\n--- Conditional Includes ---');

  // 8. Conditional include based on boolean
  const includePosts = true;
  const conditionalInclude = await client.findUnique<UserRow>('User', {
    where: { id: 'inc-user-1' },
    include: includePosts ? { posts: true } : undefined,
  });
  console.log('\nConditional include (posts):', conditionalInclude?.posts?.length ?? 0);

  // 9. Find many with includes
  const allUsersWithPosts = await client.findMany<UserRow>('User', {
    where: { id: { startsWith: 'inc-user-' } },
    include: { posts: true, following: true },
    limit: 10,
  });
  console.log('\nAll test users with posts and following:');
  for (const u of allUsersWithPosts) {
    console.log(
      `  ${u.name}: ${u.posts?.length ?? 0} posts, following ${u.following?.length ?? 0}`,
    );
  }

  console.log('\n--- Include with Select ---');

  // 10. Select specific fields while including relations
  const selectedWithPosts = await client.findMany<UserRow>('User', {
    where: { id: { startsWith: 'inc-user-' } },
    select: { name: true, email: true },
    include: { posts: { select: { title: true } } },
  });
  console.log('\nSelected fields with included posts (titles only):');
  for (const u of selectedWithPosts) {
    console.log(
      `  ${u.name} (${u.email}): ${u.posts?.map((p: any) => p.title).join(', ') || 'none'}`,
    );
  }

  await driver.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
