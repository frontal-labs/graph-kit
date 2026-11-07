// transactions.ts - Transaction Examples
// Demonstrates various transaction patterns with Graph-OM

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

  console.log('=== TRANSACTION EXAMPLES ===\n');

  // 1. Basic write transaction
  console.log('--- Basic Write Transaction ---');
  const txResult = await client.transaction(async (tx) => {
    // Create multiple users in one transaction
    const user1 = await tx.create<UserRow>('User', {
      data: { id: 'tx-user-1', name: 'Tx User 1', email: 'tx1@example.com', age: 25 },
    });
    const user2 = await tx.create<UserRow>('User', {
      data: { id: 'tx-user-2', name: 'Tx User 2', email: 'tx2@example.com', age: 30 },
    });

    // Create a relationship between them
    await tx.relate('User', user1.id, 'FOLLOWS', 'User', user2.id);

    // Return created users
    return [user1, user2];
  });
  console.log('Created in transaction:', txResult.map((u) => u.name).join(', '));

  // 2. Transaction with rollback on error
  console.log('\n--- Transaction Rollback on Error ---');
  try {
    await client.transaction(async (tx) => {
      await tx.create<UserRow>('User', {
        data: { id: 'tx-rollback-1', name: 'Will Rollback', email: 'rb1@example.com', age: 20 },
      });

      // Force an error to trigger rollback
      throw new Error('Intentional error for rollback');
    });
  } catch (error) {
    console.log('Transaction rolled back:', (error as Error).message);
  }

  // Verify rollback worked
  const rolledBackUser = await client.findUnique<UserRow>('User', {
    where: { id: 'tx-rollback-1' },
  });
  console.log(
    'User after rollback:',
    rolledBackUser ? 'EXISTS (unexpected)' : 'NOT FOUND (correct)',
  );

  // 3. Read-only transaction
  console.log('\n--- Read-Only Transaction ---');
  const readTxResult = await client.transaction(async (tx) => {
    const users = await tx.findMany<UserRow>('User', { limit: 5 });
    const count = await tx.count('User');
    return { users, count };
  });
  console.log(
    `Read transaction: ${readTxResult.count} total users, returned ${readTxResult.users.length}`,
  );

  // 4. Complex transaction: Create user with posts and relationships
  console.log('\n--- Complex Transaction: User + Posts + Relationships ---');
  const complexResult = await client.transaction(async (tx) => {
    // Create author
    const author = await tx.create<UserRow>('User', {
      data: { id: 'tx-author-1', name: 'Author One', email: 'author1@example.com', age: 35 },
    });

    // Create multiple posts
    const posts = [];
    for (let i = 1; i <= 3; i++) {
      const post = await tx.create<PostRow>('Post', {
        data: {
          id: `tx-post-${i}`,
          title: `Transactional Post ${i}`,
          content: `Content ${i}`,
          published: i < 3,
        },
      });
      posts.push(post);

      // Link post to author
      await tx.relate('Post', post.id, 'POSTED', 'User', author.id, 'IN');
    }

    // Create a follower
    const follower = await tx.create<UserRow>('User', {
      data: { id: 'tx-follower-1', name: 'Follower One', email: 'follower1@example.com', age: 28 },
    });
    await tx.relate('User', follower.id, 'FOLLOWS', 'User', author.id);

    // Follower likes first post
    await tx.relate('User', follower.id, 'LIKES', 'Post', posts[0].id);

    return { author, posts, follower };
  });
  console.log(
    `Created: ${complexResult.author.name} with ${complexResult.posts.length} posts, followed by ${complexResult.follower.name}`,
  );

  // 5. Transaction with conditional logic
  console.log('\n--- Transaction with Conditional Logic ---');
  const conditionalTx = await client.transaction(async (tx) => {
    // Check if user exists
    const existing = await tx.findUnique<UserRow>('User', { where: { id: 'tx-conditional-1' } });

    if (!existing) {
      // Create if not exists
      return tx.create<UserRow>('User', {
        data: {
          id: 'tx-conditional-1',
          name: 'Conditional User',
          email: 'cond@example.com',
          age: 40,
        },
      });
    } else {
      // Update if exists
      return tx.update<UserRow>('User', {
        where: { id: 'tx-conditional-1' },
        data: { name: 'Conditional User (Updated)' },
      });
    }
  });
  console.log('Conditional transaction result:', conditionalTx.name);

  // Run again to test update path
  const conditionalTx2 = await client.transaction(async (tx) => {
    const existing = await tx.findUnique<UserRow>('User', { where: { id: 'tx-conditional-1' } });

    if (!existing) {
      return tx.create<UserRow>('User', {
        data: {
          id: 'tx-conditional-1',
          name: 'Conditional User',
          email: 'cond@example.com',
          age: 40,
        },
      });
    } else {
      return tx.update<UserRow>('User', {
        where: { id: 'tx-conditional-1' },
        data: { name: 'Conditional User (Updated Again)' },
      });
    }
  });
  console.log('Second run result:', conditionalTx2.name);

  // 6. Batch operations in transaction
  console.log('\n--- Batch Operations in Transaction ---');
  const batchResult = await client.transaction(async (tx) => {
    // Create 10 users in a batch
    const users = [];
    for (let i = 1; i <= 10; i++) {
      const user = await tx.create<UserRow>('User', {
        data: {
          id: `tx-batch-${i}`,
          name: `Batch User ${i}`,
          email: `batch${i}@example.com`,
          age: 20 + i,
        },
      });
      users.push(user);
    }
    return users;
  });
  console.log(`Created ${batchResult.length} users in batch transaction`);

  // 7. Transaction with raw queries
  console.log('\n--- Transaction with Raw Cypher ---');
  const rawTxResult = await client.transaction(async (tx) => {
    // Use raw Cypher within transaction
    await tx.raw('CREATE (n:RawNode {id: $id, name: $name, value: $value})', {
      id: 'raw-1',
      name: 'Raw Node',
      value: 42,
    });

    const result = await tx.raw<{ name: string; value: number }>(
      'MATCH (n:RawNode {id: $id}) RETURN n.name AS name, n.value AS value',
      { id: 'raw-1' },
    );
    return result[0];
  });
  console.log('Raw query in transaction:', rawTxResult);

  // 8. Nested transactions (savepoints)
  console.log('\n--- Nested Transaction Pattern ---');
  const outerResult = await client.transaction(async (outerTx) => {
    const user = await outerTx.create<UserRow>('User', {
      data: { id: 'tx-nested-1', name: 'Outer User', email: 'outer@example.com', age: 30 },
    });

    // Inner transaction (savepoint)
    const innerResult = await outerTx.transaction(async (innerTx) => {
      const post = await innerTx.create<PostRow>('Post', {
        data: {
          id: 'tx-nested-post-1',
          title: 'Nested Post',
          content: 'In savepoint',
          published: true,
        },
      });
      await innerTx.relate('Post', post.id, 'POSTED', 'User', user.id, 'IN');
      return post;
    });

    return { user, innerResult };
  });
  console.log(`Nested transaction: ${outerResult.user.name} -> ${outerResult.innerResult.title}`);

  // 9. Transaction isolation demonstration
  console.log('\n--- Transaction Isolation ---');
  // First, create a user
  await client.create<UserRow>('User', {
    data: { id: 'tx-iso-1', name: 'Isolation User', email: 'iso@example.com', age: 25 },
  });

  // Transaction 1: Update user
  const tx1Promise = client.transaction(async (tx) => {
    await tx.update<UserRow>('User', {
      where: { id: 'tx-iso-1' },
      data: { name: 'Updated by TX1' },
    });
    // Simulate long-running transaction
    await new Promise((resolve) => setTimeout(resolve, 100));
    return tx.findUnique<UserRow>('User', { where: { id: 'tx-iso-1' } });
  });

  // Transaction 2: Try to read (will see committed state)
  await new Promise((resolve) => setTimeout(resolve, 50));
  const tx2Result = await client.transaction(async (tx) => {
    return tx.findUnique<UserRow>('User', { where: { id: 'tx-iso-1' } });
  });
  console.log('TX2 sees:', tx2Result?.name);

  const tx1Result = await tx1Promise;
  console.log('TX1 committed:', tx1Result?.name);

  await driver.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
