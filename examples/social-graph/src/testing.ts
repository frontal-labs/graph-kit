// testing.ts - Testing with Mock Driver
// Demonstrates how to test Graph-OM code using the mock driver and test utilities

import { GraphClient } from '@graph-om/core';
import { createMockDriver, createTestFixtures, type MockDriverAdapter } from '@graph-om/testing';
import { beforeEach, describe, expect, test } from 'vitest';
import { graph } from './schema.js';

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

// ============================================================
// BASIC MOCK DRIVER TESTS
// ============================================================

describe('GraphClient with MockDriver', () => {
  let client: GraphClient;
  let mockDriver: MockDriverAdapter;

  beforeEach(() => {
    mockDriver = createMockDriver();
    client = new GraphClient(mockDriver, graph);
  });

  test('findMany returns mocked data', async () => {
    // Setup mock response
    mockDriver.mockQuery(
      'MATCH (n:User) RETURN n LIMIT $limit',
      [{ id: '1', name: 'Alice', email: 'alice@example.com', age: 28, createdAt: new Date() }],
      { limit: 10 },
    );

    const users = await client.findMany<UserRow>('User', { limit: 10 });

    expect(users).toHaveLength(1);
    expect(users[0].name).toBe('Alice');
    expect(users[0].email).toBe('alice@example.com');
  });

  test('findUnique with primary key', async () => {
    mockDriver.mockQuery(
      'MATCH (n:User {id: $id}) RETURN n',
      [{ id: 'user-1', name: 'Bob', email: 'bob@example.com', age: 32, createdAt: new Date() }],
      { id: 'user-1' },
    );

    const user = await client.findUnique<UserRow>('User', { where: { id: 'user-1' } });

    expect(user).not.toBeNull();
    expect(user?.name).toBe('Bob');
  });

  test('findUnique returns null when not found', async () => {
    mockDriver.mockQuery('MATCH (n:User {id: $id}) RETURN n', [], { id: 'missing' });

    const user = await client.findUnique<UserRow>('User', { where: { id: 'missing' } });

    expect(user).toBeNull();
  });

  test('create user', async () => {
    mockDriver.mockQuery(
      'CREATE (n:User {id: $id, name: $name, email: $email, age: $age, createdAt: $createdAt}) RETURN n',
      [{ id: 'new-1', name: 'Carol', email: 'carol@example.com', age: 25, createdAt: new Date() }],
      {
        id: 'new-1',
        name: 'Carol',
        email: 'carol@example.com',
        age: 25,
        createdAt: expect.any(Date),
      },
    );

    const created = await client.create<UserRow>('User', {
      data: { id: 'new-1', name: 'Carol', email: 'carol@example.com', age: 25 },
    });

    expect(created.name).toBe('Carol');
    expect(created.id).toBe('new-1');
  });

  test('update user', async () => {
    mockDriver.mockQuery(
      'MATCH (n:User {id: $id}) SET n.age = $age RETURN n',
      [{ id: 'user-1', name: 'Bob', email: 'bob@example.com', age: 33, createdAt: new Date() }],
      { id: 'user-1', age: 33 },
    );

    const updated = await client.update<UserRow>('User', {
      where: { id: 'user-1' },
      data: { age: 33 },
    });

    expect(updated.age).toBe(33);
  });

  test('delete user', async () => {
    mockDriver.mockQuery('MATCH (n:User {id: $id}) DETACH DELETE n', [], { id: 'user-1' });

    await client.delete('User', { where: { id: 'user-1' } });

    // Verify query was called
    expect(mockDriver.getQueryCount('MATCH (n:User {id: $id}) DETACH DELETE n')).toBe(1);
  });

  test('count users', async () => {
    mockDriver.mockQuery('MATCH (n:User) RETURN count(n) as result', [{ result: 5 }], {});

    const count = await client.count('User');

    expect(count).toBe(5);
  });

  test('count with where clause', async () => {
    mockDriver.mockQuery(
      'MATCH (n:User) WHERE n.age >= $age1 RETURN count(n) as result',
      [{ result: 3 }],
      { age1: 30 },
    );

    const count = await client.count('User', { age: { gte: 30 } });

    expect(count).toBe(3);
  });
});

// ============================================================
// TRANSACTION TESTS
// ============================================================

describe('GraphClient Transactions with MockDriver', () => {
  let client: GraphClient;
  let mockDriver: MockDriverAdapter;

  beforeEach(() => {
    mockDriver = createMockDriver();
    client = new GraphClient(mockDriver, graph);
  });

  test('transaction commits on success', async () => {
    mockDriver.mockTransaction(async (tx) => {
      // Mock the transaction queries
      tx.mockQuery('CREATE (n:User) RETURN n', [
        { id: 'tx-1', name: 'Tx User', email: 'tx@example.com', age: 20, createdAt: new Date() },
      ]);
      tx.mockQuery(
        'MATCH (a:User {id: $fromId}) MATCH (b:User {id: $toId}) CREATE (a)-[:FOLLOWS]->(b)',
        [{ fromId: 'tx-1', toId: 'existing-1' }],
        { fromId: 'tx-1', toId: 'existing-1' },
      );
    });

    const result = await client.transaction(async (tx) => {
      const user = await tx.create<UserRow>('User', {
        data: { id: 'tx-1', name: 'Tx User', email: 'tx@example.com', age: 20 },
      });
      await tx.relate('User', user.id, 'FOLLOWS', 'User', 'existing-1');
      return user;
    });

    expect(result.name).toBe('Tx User');
  });

  test('transaction rolls back on error', async () => {
    mockDriver.mockTransaction(async (tx) => {
      tx.mockQuery('CREATE (n:User) RETURN n', [{ id: 'tx-2' }]);
    });

    await expect(
      client.transaction(async (tx) => {
        await tx.create<UserRow>('User', {
          data: { id: 'tx-2', name: 'Tx User', email: 'tx@example.com', age: 20 },
        });
        throw new Error('Intentional error');
      }),
    ).rejects.toThrow('Intentional error');

    // Verify rollback was called
    expect(mockDriver.rollbackCalled).toBe(true);
  });
});

// ============================================================
// RELATIONSHIP TESTS
// ============================================================

describe('Relationship Operations with MockDriver', () => {
  let client: GraphClient;
  let mockDriver: MockDriverAdapter;

  beforeEach(() => {
    mockDriver = createMockDriver();
    client = new GraphClient(mockDriver, graph);
  });

  test('relate creates relationship', async () => {
    mockDriver.mockQuery(
      'MATCH (a:User {id: $fromId}) MATCH (b:User {id: $toId}) CREATE (a)-[:FOLLOWS]->(b)',
      [],
      { fromId: 'user-1', toId: 'user-2' },
    );

    await client.relate('User', 'user-1', 'FOLLOWS', 'User', 'user-2');

    expect(
      mockDriver.getQueryCount(
        'MATCH (a:User {id: $fromId}) MATCH (b:User {id: $toId}) CREATE (a)-[:FOLLOWS]->(b)',
      ),
    ).toBe(1);
  });

  test('unrelate deletes relationship', async () => {
    mockDriver.mockQuery(
      'MATCH (a:User {id: $fromId})-[r:FOLLOWS]->(b:User {id: $toId}) DELETE r',
      [],
      { fromId: 'user-1', toId: 'user-2' },
    );

    await client.unrelate('User', 'user-1', 'FOLLOWS', 'User', 'user-2');

    expect(
      mockDriver.getQueryCount(
        'MATCH (a:User {id: $fromId})-[r:FOLLOWS]->(b:User {id: $toId}) DELETE r',
      ),
    ).toBe(1);
  });

  test('include loads relationships', async () => {
    // Mock the main query
    mockDriver.mockQuery(
      'MATCH (n:User) RETURN n LIMIT $limit',
      [
        { id: 'user-1', name: 'Alice', email: 'alice@example.com', age: 28, createdAt: new Date() },
        { id: 'user-2', name: 'Bob', email: 'bob@example.com', age: 32, createdAt: new Date() },
      ],
      { limit: 10 },
    );

    // Mock the hydration query for posts
    mockDriver.mockQuery(
      'UNWIND $ids AS sourceId MATCH (a:User {id: sourceId})-[r:POSTED]->(b:Post) RETURN sourceId, b',
      [
        {
          sourceId: 'user-1',
          b: {
            id: 'post-1',
            title: 'Post 1',
            content: 'Content',
            published: true,
            createdAt: new Date(),
          },
        },
      ],
      { ids: ['user-1', 'user-2'] },
    );

    const users = await client.findMany<UserRow>('User', {
      limit: 10,
      include: { posts: true },
    });

    expect(users).toHaveLength(2);
    // First user has posts, second doesn't
    expect(users[0].posts).toHaveLength(1);
    expect(users[1].posts).toHaveLength(0);
  });
});

// ============================================================
// TRAVERSAL TESTS
// ============================================================

describe('Traversal Operations with MockDriver', () => {
  let client: GraphClient;
  let mockDriver: MockDriverAdapter;

  beforeEach(() => {
    mockDriver = createMockDriver();
    client = new GraphClient(mockDriver, graph);
  });

  test('traverse follows path', async () => {
    mockDriver.mockQuery(
      'MATCH (a:User {id: $fromId})-[r:FOLLOWS*1..$maxDepth]->(b:User) RETURN a, b LIMIT $limit',
      [
        { a: { id: 'user-1', name: 'Alice' }, b: { id: 'user-2', name: 'Bob' } },
        { a: { id: 'user-1', name: 'Alice' }, b: { id: 'user-3', name: 'Carol' } },
      ],
      { fromId: 'user-1', maxDepth: 3, limit: 100 },
    );

    const network = await client.traverse('User', 'FOLLOWS', 'User', {
      fromId: 'user-1',
      maxDepth: 3,
    });

    expect(network).toHaveLength(2);
    expect(network.map((n) => n.name)).toContain('Bob');
    expect(network.map((n) => n.name)).toContain('Carol');
  });

  test('findShortestPath', async () => {
    mockDriver.mockQuery(
      'MATCH p = shortestPath((a:User {id: $fromId})-[r:FOLLOWS*]->(b:User {id: $toId})) RETURN p',
      [
        {
          n: { id: 'user-1', name: 'Alice' },
          m: { id: 'user-3', name: 'Carol' },
          path: { length: 2 },
        },
      ],
      { fromId: 'user-1', toId: 'user-3', maxDepth: 5 },
    );

    const path = await client.findShortestPath('User', 'FOLLOWS', 'User', {
      fromId: 'user-1',
      toId: 'user-3',
      maxDepth: 5,
    });

    expect(path).not.toBeNull();
    expect(path?.nodes).toHaveLength(2);
  });

  test('findAllShortestPaths', async () => {
    mockDriver.mockQuery(
      'MATCH p = allShortestPaths((a:User {id: $fromId})-[r:FOLLOWS*]->(b:User {id: $toId})) RETURN p',
      [
        {
          n: { id: 'user-1', name: 'Alice' },
          m: { id: 'user-3', name: 'Carol' },
          path: { length: 2 },
        },
      ],
      { fromId: 'user-1', toId: 'user-3', maxDepth: 5 },
    );

    const paths = await client.findAllShortestPaths('User', 'FOLLOWS', 'User', {
      fromId: 'user-1',
      toId: 'user-3',
      maxDepth: 5,
    });

    expect(paths).toHaveLength(1);
  });
});

// ============================================================
// RAW QUERY TESTS
// ============================================================

describe('Raw Cypher Queries with MockDriver', () => {
  let client: GraphClient;
  let mockDriver: MockDriverAdapter;

  beforeEach(() => {
    mockDriver = createMockDriver();
    client = new GraphClient(mockDriver, graph);
  });

  test('raw query with parameters', async () => {
    mockDriver.mockQuery(
      'MATCH (u:User)-[:FOLLOWS]->(f:User) RETURN u.name AS follower, f.name AS followed',
      [
        { follower: 'Alice', followed: 'Bob' },
        { follower: 'Bob', followed: 'Carol' },
      ],
      {},
    );

    const result = await client.raw<{ follower: string; followed: string }>(
      'MATCH (u:User)-[:FOLLOWS]->(f:User) RETURN u.name AS follower, f.name AS followed',
    );

    expect(result).toHaveLength(2);
    expect(result[0].follower).toBe('Alice');
    expect(result[0].followed).toBe('Bob');
  });

  test('raw query with parameters', async () => {
    mockDriver.mockQuery('MATCH (u:User {id: $id}) RETURN u.name AS name', [{ name: 'Alice' }], {
      id: 'user-1',
    });

    const result = await client.raw<{ name: string }>(
      'MATCH (u:User {id: $id}) RETURN u.name AS name',
      { id: 'user-1' },
    );

    expect(result[0].name).toBe('Alice');
  });
});

// ============================================================
// AGGREGATION TESTS
// ============================================================

describe('Aggregation Operations with MockDriver', () => {
  let client: GraphClient;
  let mockDriver: MockDriverAdapter;

  beforeEach(() => {
    mockDriver = createMockDriver();
    client = new GraphClient(mockDriver, graph);
  });

  test('aggregate count', async () => {
    mockDriver.mockQuery('MATCH (n:User) RETURN count(n) as result', [{ result: 10 }], {});

    const count = await client.count('User');
    expect(count).toBe(10);
  });

  test('aggregate avg', async () => {
    mockDriver.mockQuery(
      'MATCH (n:User) WHERE n.age IS NOT NULL RETURN avg(n.age) as result',
      [{ result: 28.5 }],
      {},
    );

    const avg = await client.aggregate('User', 'avg', 'age');
    expect(avg).toBeCloseTo(28.5);
  });

  test('aggregate sum', async () => {
    mockDriver.mockQuery(
      'MATCH (n:User) WHERE n.age IS NOT NULL RETURN sum(n.age) as result',
      [{ result: 285 }],
      {},
    );

    const sum = await client.aggregate('User', 'sum', 'age');
    expect(sum).toBe(285);
  });

  test('aggregate min/max', async () => {
    mockDriver.mockQuery(
      'MATCH (n:User) WHERE n.age IS NOT NULL RETURN min(n.age) as result',
      [{ result: 20 }],
      {},
    );

    const min = await client.aggregate('User', 'min', 'age');
    expect(min).toBe(20);

    mockDriver.mockQuery(
      'MATCH (n:User) WHERE n.age IS NOT NULL RETURN max(n.age) as result',
      [{ result: 35 }],
      {},
    );

    const max = await client.aggregate('User', 'max', 'age');
    expect(max).toBe(35);
  });

  test('aggregate with where clause', async () => {
    mockDriver.mockQuery(
      'MATCH (n:User) WHERE n.age >= $age1 RETURN avg(n.age) as result',
      [{ result: 32 }],
      { age1: 30 },
    );

    const avg = await client.aggregate('User', 'avg', 'age', { age: { gte: 30 } });
    expect(avg).toBe(32);
  });
});

// ============================================================
// CUSTOM MATCHERS TESTS
// ============================================================

describe('Custom Vitest Matchers', () => {
  let client: GraphClient;
  let mockDriver: MockDriverAdapter;

  beforeEach(() => {
    mockDriver = createMockDriver();
    client = new GraphClient(mockDriver, graph);
  });

  test('toBeValidNode matcher', async () => {
    mockDriver.mockQuery(
      'MATCH (n:User {id: $id}) RETURN n',
      [{ id: 'user-1', name: 'Alice', email: 'alice@example.com', age: 28, createdAt: new Date() }],
      { id: 'user-1' },
    );

    const user = await client.findUnique<UserRow>('User', { where: { id: 'user-1' } });

    expect(user).toBeValidNode('User');
  });

  test('toHaveRelation matcher', async () => {
    mockDriver.mockQuery(
      'MATCH (n:User {id: $id}) RETURN n',
      [{ id: 'user-1', name: 'Alice', email: 'alice@example.com', age: 28, createdAt: new Date() }],
      { id: 'user-1' },
    );

    mockDriver.mockQuery(
      'UNWIND $ids AS sourceId MATCH (a:User {id: sourceId})-[r:POSTED]->(b:Post) RETURN sourceId, b',
      [{ sourceId: 'user-1', b: { id: 'post-1', title: 'Post 1' } }],
      { ids: ['user-1'] },
    );

    const user = await client.findUnique<UserRow>('User', {
      where: { id: 'user-1' },
      include: { posts: true },
    });

    expect(user).toHaveRelation('posts');
  });

  test('toMatchCypherPattern matcher', () => {
    const cypher = 'MATCH (n:User) WHERE n.name = $name RETURN n';
    expect(cypher).toMatchCypherPattern('MATCH \\(n:User\\)');
    expect(cypher).toMatchCypherPattern('RETURN n');
  });
});

// ============================================================
// TEST FIXTURES TESTS
// ============================================================

describe('Test Fixtures', () => {
  test('createUserFactory generates valid users', () => {
    const factory = createTestFixtures().createUserFactory();

    const user1 = factory(1);
    const user2 = factory(2);

    expect(user1.id).toBe('user-1');
    expect(user1.name).toBe('User 1');
    expect(user1.email).toBe('user1@example.com');
    expect(user2.id).toBe('user-2');
    expect(user2.name).toBe('User 2');
  });

  test('createPostFactory generates valid posts', () => {
    const factory = createTestFixtures().createPostFactory();

    const post1 = factory(1);
    const post2 = factory(2);

    expect(post1.id).toBe('post-1');
    expect(post1.title).toBe('Post 1');
    expect(post1.published).toBe(true);
    expect(post2.published).toBe(false); // alternates
  });

  test('generateTestData creates multiple items', () => {
    const factory = createTestFixtures().createUserFactory();
    const users = generateTestData({ count: 5, factory });

    expect(users).toHaveLength(5);
    expect(users[0].id).toBe('user-0');
    expect(users[4].id).toBe('user-4');
  });
});

// ============================================================
// INTEGRATION-STYLE TESTS
// ============================================================

describe('Integration-style Tests', () => {
  let client: GraphClient;
  let mockDriver: MockDriverAdapter;

  beforeEach(() => {
    mockDriver = createMockDriver();
    client = new GraphClient(mockDriver, graph);
  });

  test('full user lifecycle: create -> read -> update -> delete', async () => {
    // Setup all expected queries in order
    mockDriver.mockQuery('CREATE (n:User) RETURN n', [
      {
        id: 'lifecycle-1',
        name: 'Lifecycle',
        email: 'life@example.com',
        age: 25,
        createdAt: new Date(),
      },
    ]);

    mockDriver.mockQuery(
      'MATCH (n:User {id: $id}) RETURN n',
      [
        {
          id: 'lifecycle-1',
          name: 'Lifecycle',
          email: 'life@example.com',
          age: 25,
          createdAt: new Date(),
        },
      ],
      { id: 'lifecycle-1' },
    );

    mockDriver.mockQuery(
      'MATCH (n:User {id: $id}) SET n.age = $age RETURN n',
      [
        {
          id: 'lifecycle-1',
          name: 'Lifecycle',
          email: 'life@example.com',
          age: 26,
          createdAt: new Date(),
        },
      ],
      { id: 'lifecycle-1', age: 26 },
    );

    mockDriver.mockQuery(
      'MATCH (n:User {id: $id}) RETURN n',
      [
        {
          id: 'lifecycle-1',
          name: 'Lifecycle',
          email: 'life@example.com',
          age: 26,
          createdAt: new Date(),
        },
      ],
      { id: 'lifecycle-1' },
    );

    mockDriver.mockQuery('MATCH (n:User {id: $id}) DETACH DELETE n', [], { id: 'lifecycle-1' });

    // Create
    const created = await client.create<UserRow>('User', {
      data: { id: 'lifecycle-1', name: 'Lifecycle', email: 'life@example.com', age: 25 },
    });
    expect(created.age).toBe(25);

    // Read
    const found = await client.findUnique<UserRow>('User', { where: { id: 'lifecycle-1' } });
    expect(found).not.toBeNull();

    // Update
    const updated = await client.update<UserRow>('User', {
      where: { id: 'lifecycle-1' },
      data: { age: 26 },
    });
    expect(updated.age).toBe(26);

    // Read again
    const foundAfterUpdate = await client.findUnique<UserRow>('User', {
      where: { id: 'lifecycle-1' },
    });
    expect(foundAfterUpdate?.age).toBe(26);

    // Delete
    await client.delete('User', { where: { id: 'lifecycle-1' } });

    // Verify deleted (mock would return empty for subsequent reads)
    mockDriver.mockQuery('MATCH (n:User {id: $id}) RETURN n', [], { id: 'lifecycle-1' });
    const deleted = await client.findUnique<UserRow>('User', { where: { id: 'lifecycle-1' } });
    expect(deleted).toBeNull();
  });

  test('user with posts and relationships', async () => {
    // Create user
    mockDriver.mockQuery('CREATE (n:User) RETURN n', [
      {
        id: 'rel-user-1',
        name: 'Rel User',
        email: 'rel@example.com',
        age: 30,
        createdAt: new Date(),
      },
    ]);

    // Create posts
    mockDriver.mockQuery('CREATE (n:Post) RETURN n', [
      {
        id: 'rel-post-1',
        title: 'Post 1',
        content: 'Content',
        published: true,
        createdAt: new Date(),
      },
    ]);

    mockDriver.mockQuery('CREATE (n:Post) RETURN n', [
      {
        id: 'rel-post-2',
        title: 'Post 2',
        content: 'Content',
        published: false,
        createdAt: new Date(),
      },
    ]);

    // Relate posts to user
    mockDriver.mockQuery(
      'MATCH (a:Post {id: $fromId}) MATCH (b:User {id: $toId}) CREATE (a)-[:POSTED]->(b)',
      [],
      { fromId: 'rel-post-1', toId: 'rel-user-1' },
    );

    mockDriver.mockQuery(
      'MATCH (a:Post {id: $fromId}) MATCH (b:User {id: $toId}) CREATE (a)-[:POSTED]->(b)',
      [],
      { fromId: 'rel-post-2', toId: 'rel-user-1' },
    );

    // Create follower
    mockDriver.mockQuery('CREATE (n:User) RETURN n', [
      {
        id: 'rel-follower-1',
        name: 'Follower',
        email: 'follower@example.com',
        age: 28,
        createdAt: new Date(),
      },
    ]);

    // Follower follows user
    mockDriver.mockQuery(
      'MATCH (a:User {id: $fromId}) MATCH (b:User {id: $toId}) CREATE (a)-[:FOLLOWS]->(b)',
      [],
      { fromId: 'rel-follower-1', toId: 'rel-user-1' },
    );

    // Follower likes post
    mockDriver.mockQuery(
      'MATCH (a:User {id: $fromId}) MATCH (b:Post {id: $toId}) CREATE (a)-[:LIKES]->(b)',
      [],
      { fromId: 'rel-follower-1', toId: 'rel-post-1' },
    );

    // Execute the operations
    const user = await client.create<UserRow>('User', {
      data: { id: 'rel-user-1', name: 'Rel User', email: 'rel@example.com', age: 30 },
    });

    const _post1 = await client.create<PostRow>('Post', {
      data: { id: 'rel-post-1', title: 'Post 1', content: 'Content', published: true },
    });

    const _post2 = await client.create<PostRow>('Post', {
      data: { id: 'rel-post-2', title: 'Post 2', content: 'Content', published: false },
    });

    await client.relate('Post', 'rel-post-1', 'POSTED', 'User', 'rel-user-1', 'IN');
    await client.relate('Post', 'rel-post-2', 'POSTED', 'User', 'rel-user-1', 'IN');

    const follower = await client.create<UserRow>('User', {
      data: { id: 'rel-follower-1', name: 'Follower', email: 'follower@example.com', age: 28 },
    });

    await client.relate('User', 'rel-follower-1', 'FOLLOWS', 'User', 'rel-user-1');
    await client.relate('User', 'rel-follower-1', 'LIKES', 'Post', 'rel-post-1');

    expect(user.name).toBe('Rel User');
    expect(follower.name).toBe('Follower');
  });
});

// ============================================================
// ERROR HANDLING TESTS
// ============================================================

describe('Error Handling', () => {
  let client: GraphClient;
  let mockDriver: MockDriverAdapter;

  beforeEach(() => {
    mockDriver = createMockDriver();
    client = new GraphClient(mockDriver, graph);
  });

  test('throws on unregistered node', () => {
    expect(() => client.getNodeConfig('NonExistent')).toThrow('not registered');
  });

  test('throws on update non-existent', async () => {
    mockDriver.mockQuery('MATCH (n:User {id: $id}) SET n.name = $name RETURN n', [], {
      id: 'missing',
      name: 'New',
    });

    await expect(
      client.update<UserRow>('User', { where: { id: 'missing' }, data: { name: 'New' } }),
    ).rejects.toThrow('record not found');
  });

  test('throws on upsert without primary key', async () => {
    await expect(
      client.upsert<UserRow>('User', {
        where: { name: 'Alice' }, // not primary key
        create: { name: 'Alice' },
        update: { name: 'Bob' },
      }),
    ).rejects.toThrow('primary key');
  });

  test('throws on raw query error', async () => {
    mockDriver.mockQuery('INVALID CYPHER', [], {}, true); // true = should throw

    await expect(client.raw('INVALID CYPHER')).rejects.toThrow();
  });
});
