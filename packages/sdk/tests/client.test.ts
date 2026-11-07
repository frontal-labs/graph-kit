import type { Mock } from 'vitest';
import { describe, expect, it, vi } from 'vitest';
import type { GraphTransaction } from '../src/client';
import { GraphClient, neo4jIntegerToNumber, parseNeo4jValue } from '../src/client';
import type {
  DriverAdapter,
  NodeConfig,
  QueryRecord,
  QueryResult,
  TransactionContext,
} from '../src/types';

function makeRecord(obj: Record<string, unknown>): QueryRecord {
  return {
    keys: Object.keys(obj),
    get: (key: string) => obj[key],
    toObject: () => obj,
  };
}

function makeResult(records: Array<Record<string, unknown>>): QueryResult {
  return {
    records: records.map(makeRecord),
    summary: {
      query: { text: '', parameters: {} },
      counters: {},
      notifications: [],
      database: { name: 'neo4j' },
    },
    keys: records[0] ? Object.keys(records[0]) : [],
  };
}

interface TestAdapter extends DriverAdapter {
  connect: Mock;
  disconnect: Mock;
  runQuery: Mock;
  runInTransaction: Mock;
  runInReadTransaction: Mock;
  verifyConnectivity: Mock;
  getServerInfo: Mock;
}

function makeAdapter(runQueryMock: Mock): TestAdapter {
  return {
    connect: vi.fn(async () => undefined),
    disconnect: vi.fn(async () => undefined),
    runQuery: runQueryMock,
    runInTransaction: vi.fn(),
    runInReadTransaction: vi.fn(),
    verifyConnectivity: vi.fn(async () => true),
    getServerInfo: vi.fn(async () => ({
      address: 'localhost:7687',
      version: '5.0',
      protocol: '5.0',
    })),
  } as unknown as TestAdapter;
}

const userConfig: NodeConfig<'User', any> = {
  label: 'User',
  properties: {
    id: { type: 'string', primary: true },
    name: { type: 'string' },
  },
  relations: {
    posts: {
      type: 'POSTED',
      direction: 'OUT',
      target: 'Post',
      multiple: true,
    },
    profile: {
      type: 'HAS_PROFILE',
      direction: 'OUT',
      target: 'Profile',
      multiple: false,
    },
  },
};

const postConfig: NodeConfig<'Post', any> = {
  label: 'Post',
  properties: {
    id: { type: 'string', primary: true },
    title: { type: 'string' },
  },
  relations: {},
};

describe('GraphClient', () => {
  it('throws a helpful error for unregistered nodes', () => {
    const client = new GraphClient(makeAdapter(vi.fn()));
    expect(() => client.getNodeConfig('Nope')).toThrow(/not registered/);
  });

  it('registers nodes via registerNode and registerNodes', () => {
    const client = new GraphClient(makeAdapter(vi.fn()));
    client.registerNode('User', userConfig);
    client.registerNodes({ Post: postConfig });
    expect(client.getNodeConfig('User').label).toBe('User');
    expect(client.getNodeConfig('Post').label).toBe('Post');
  });

  it('findMany runs a compiled query and maps records', async () => {
    const runQuery = vi.fn(async (_cypher: string, _params?: Record<string, unknown>) =>
      makeResult([
        { id: '1', name: 'Alice' },
        { id: '2', name: 'Bob' },
      ]),
    );
    const client = new GraphClient(makeAdapter(runQuery), { User: userConfig });
    const users = await client.findMany<{ id: string; name: string }>('User', {
      where: { name: 'Alice' },
      limit: 10,
    });

    expect(runQuery).toHaveBeenCalledTimes(1);
    const [cypher, params] = runQuery.mock.calls[0]!;
    expect(cypher).toContain('MATCH (n:User)');
    expect(cypher).toContain('WHERE n.name = $name1');
    expect(cypher).toContain('LIMIT 10');
    expect(params).toMatchObject({ name1: 'Alice' });
    expect(users).toEqual([
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
    ]);
  });

  it('findUnique returns null when no records', async () => {
    const runQuery = vi.fn(async (_cypher: string, _params?: Record<string, unknown>) =>
      makeResult([]),
    );
    const client = new GraphClient(makeAdapter(runQuery), { User: userConfig });
    const user = await client.findUnique('User', { where: { id: 'missing' } });
    expect(user).toBeNull();
  });

  it('findUnique uses the primary key fast path', async () => {
    const runQuery = vi.fn(async (_cypher: string, _params?: Record<string, unknown>) =>
      makeResult([{ id: '1', name: 'Alice' }]),
    );
    const client = new GraphClient(makeAdapter(runQuery), { User: userConfig });
    const user = await client.findUnique('User', { where: { id: '1' } });
    const [cypher, params] = runQuery.mock.calls[0]!;
    expect(cypher).toBe('MATCH (n:User {id: $id}) RETURN n');
    expect(params).toEqual({ id: '1' });
    expect(user).toEqual({ id: '1', name: 'Alice' });
  });

  it('create without relations uses compileCreate', async () => {
    const runQuery = vi.fn(async (_cypher: string, _params?: Record<string, unknown>) =>
      makeResult([{ id: '1', name: 'Alice' }]),
    );
    const client = new GraphClient(makeAdapter(runQuery), { User: userConfig });
    const created = await client.create('User', { data: { id: '1', name: 'Alice' } });
    const [cypher] = runQuery.mock.calls[0]!;
    expect(cypher).toContain('CREATE (n:User');
    expect(created).toEqual({ id: '1', name: 'Alice' });
  });

  it('create with relations uses compileCreateAndConnect', async () => {
    const runQuery = vi.fn(async (_cypher: string, _params?: Record<string, unknown>) =>
      makeResult([{ id: '1', name: 'Alice' }]),
    );
    const client = new GraphClient(makeAdapter(runQuery), { User: userConfig });
    await client.create('User', {
      data: { id: '1', name: 'Alice' },
      relations: { posts: { connect: { id: 'p1' } } },
    });
    const [cypher] = runQuery.mock.calls[0]!;
    expect(cypher).toContain('MATCH (target0:Post {id:');
    expect(cypher).toContain('CREATE (n)-[r0:POSTED]->(target0)');
  });

  it('update throws when record not found', async () => {
    const runQuery = vi.fn(async (_cypher: string, _params?: Record<string, unknown>) =>
      makeResult([]),
    );
    const client = new GraphClient(makeAdapter(runQuery), { User: userConfig });
    await expect(
      client.update('User', { where: { id: 'missing' }, data: { name: 'X' } }),
    ).rejects.toThrow(/record not found/);
  });

  it('delete issues DETACH DELETE', async () => {
    const runQuery = vi.fn(async (_cypher: string, _params?: Record<string, unknown>) =>
      makeResult([]),
    );
    const client = new GraphClient(makeAdapter(runQuery), { User: userConfig });
    await client.delete('User', { where: { id: '1' } });
    const [cypher] = runQuery.mock.calls[0]!;
    expect(cypher).toContain('DETACH DELETE n');
  });

  it('upsert throws a descriptive error without primary-key identity', async () => {
    const runQuery = vi.fn(async (_cypher: string, _params?: Record<string, unknown>) =>
      makeResult([]),
    );
    const client = new GraphClient(makeAdapter(runQuery), { User: userConfig });
    await expect(
      client.upsert('User', {
        where: { name: 'Alice' },
        create: { name: 'A' },
        update: { name: 'B' },
      }),
    ).rejects.toThrow(/primary key/);
  });

  it('count converts integer results to numbers', async () => {
    const intLike = { low: 5, high: 0, toNumber: () => 5 };
    const runQuery = vi.fn(async (_cypher: string, _params?: Record<string, unknown>) =>
      makeResult([{ result: intLike }]),
    );
    const client = new GraphClient(makeAdapter(runQuery), { User: userConfig });
    const count = await client.count('User');
    expect(count).toBe(5);
  });

  it('relate uses elementId-based Cypher', async () => {
    const runQuery = vi.fn(async (_cypher: string, _params?: Record<string, unknown>) =>
      makeResult([]),
    );
    const client = new GraphClient(makeAdapter(runQuery), { User: userConfig });
    await client.relate('User', 'a1', 'POSTED', 'Post', 'p1', 'OUT');
    const [cypher, params] = runQuery.mock.calls[0]!;
    expect(cypher).toContain('elementId(a) = $fromId');
    expect(params).toEqual({ fromId: 'a1', toId: 'p1' });
  });

  it('unrelate filters endpoints and deletes the relationship', async () => {
    const runQuery = vi.fn(async (_cypher: string, _params?: Record<string, unknown>) =>
      makeResult([]),
    );
    const client = new GraphClient(makeAdapter(runQuery), { User: userConfig });
    await client.unrelate('User', 'a1', 'POSTED', 'Post', 'p1', 'OUT');
    const [cypher] = runQuery.mock.calls[0]!;
    expect(cypher).toContain('DELETE r');
    expect(cypher).toContain('elementId(a) = $fromId');
  });

  it('include batches relation hydration with UNWIND (single query per relation)', async () => {
    const runQuery = vi.fn(async (cypher: string, _params?: Record<string, unknown>) => {
      if (cypher.includes('UNWIND $ids')) {
        return makeResult([
          { sourceId: '1', b: { id: 'p1', title: 'Hello' } },
          { sourceId: '2', b: { id: 'p2', title: 'World' } },
        ]);
      }
      return makeResult([
        { id: '1', name: 'Alice' },
        { id: '2', name: 'Bob' },
      ]);
    });
    const client = new GraphClient(makeAdapter(runQuery), {
      User: userConfig,
      Post: postConfig,
    });

    const users = await client.findMany<any>('User', { include: { posts: true } });

    expect(runQuery).toHaveBeenCalledTimes(2);
    const [hydrateCypher, hydrateParams] = runQuery.mock.calls[1]!;
    expect(hydrateCypher).toContain('UNWIND $ids AS sourceId');
    expect(hydrateCypher).toContain('[r:POSTED]->');
    expect(hydrateParams).toEqual({ ids: ['1', '2'] });
    expect(users[0]?.posts).toEqual([{ id: 'p1', title: 'Hello' }]);
    expect(users[1]?.posts).toEqual([{ id: 'p2', title: 'World' }]);
  });

  it('include hydrates single (non-multiple) relations as object or null', async () => {
    const profileConfig: NodeConfig<'Profile', any> = {
      label: 'Profile',
      properties: { id: { type: 'string', primary: true } },
      relations: {},
    };
    const runQuery = vi.fn(async (cypher: string, _params?: Record<string, unknown>) => {
      if (cypher.includes('UNWIND $ids')) {
        return makeResult([{ sourceId: '1', b: { id: 'prof1' } }]);
      }
      return makeResult([{ id: '1', name: 'Alice' }]);
    });
    const client = new GraphClient(makeAdapter(runQuery), {
      User: userConfig,
      Profile: profileConfig,
    });

    const users = await client.findMany<any>('User', { include: { profile: true } });
    expect(users[0]?.profile).toEqual({ id: 'prof1' });
  });

  it('transaction methods normalize Neo4j values', async () => {
    const adapter = makeAdapter(vi.fn());
    const intLike = { low: 3, high: 0, toNumber: () => 3 };
    adapter.runInTransaction = vi.fn(
      async (work: (txc: TransactionContext) => Promise<unknown>) => {
        const txc: TransactionContext = {
          run: vi.fn(async () => makeResult([{ id: '1', age: intLike }])),
        };
        return work(txc);
      },
    );
    const client = new GraphClient(adapter, { User: userConfig });

    const rows = await client.transaction(async (tx: GraphTransaction) => {
      return tx.findMany<any>('User');
    });

    expect(rows).toEqual([{ id: '1', age: 3 }]);
  });

  it('disconnect delegates to the adapter', async () => {
    const adapter = makeAdapter(vi.fn());
    const client = new GraphClient(adapter);
    await client.disconnect();
    expect(adapter.disconnect).toHaveBeenCalled();
  });

  it('raw passes through cypher and params', async () => {
    const runQuery = vi.fn(async (_cypher: string, _params?: Record<string, unknown>) =>
      makeResult([{ n: { id: '1' } }]),
    );
    const client = new GraphClient(makeAdapter(runQuery), { User: userConfig });
    const rows = await client.raw('MATCH (n:User) RETURN n', { limit: 10 });
    expect(runQuery).toHaveBeenCalledWith('MATCH (n:User) RETURN n', { limit: 10 });
    expect(rows).toEqual([{ n: { id: '1' } }]);
  });

  it('fromConfig accepts an adapter instance', () => {
    const adapter = makeAdapter(vi.fn());
    const client = GraphClient.fromConfig(adapter, { schema: './schema.ts' }, { User: userConfig });
    expect(client.getDriver()).toBe(adapter);
    expect(client.getNodeConfig('User').label).toBe('User');
  });

  it('fromConfig accepts an adapter factory', () => {
    const adapter = makeAdapter(vi.fn());
    const factory = vi.fn(() => adapter);
    const client = GraphClient.fromConfig(factory, { driver: { type: 'neo4j' } });
    expect(factory).toHaveBeenCalled();
    expect(client.getDriver()).toBe(adapter);
  });
});

describe('parseNeo4jValue', () => {
  it('passes through primitives and null', () => {
    expect(parseNeo4jValue(null)).toBeNull();
    expect(parseNeo4jValue(undefined)).toBeUndefined();
    expect(parseNeo4jValue('x')).toBe('x');
    expect(parseNeo4jValue(42)).toBe(42);
  });

  it('converts Integer-like objects to numbers', () => {
    expect(parseNeo4jValue({ low: 7, high: 0, toNumber: () => 7 })).toBe(7);
    expect(parseNeo4jValue({ low: 7, high: 0 })).toBe(7);
  });

  it('recurses into arrays', () => {
    expect(parseNeo4jValue([{ low: 1, high: 0 }, 2])).toEqual([1, 2]);
  });

  it('passes Date instances through', () => {
    const d = new Date();
    expect(parseNeo4jValue(d)).toBe(d);
  });
});

describe('neo4jIntegerToNumber', () => {
  it('handles numbers, null, integer-like, and fallbacks', () => {
    expect(neo4jIntegerToNumber(5)).toBe(5);
    expect(neo4jIntegerToNumber(null)).toBe(0);
    expect(neo4jIntegerToNumber(undefined)).toBe(0);
    expect(neo4jIntegerToNumber({ low: 9, high: 0, toNumber: () => 9 })).toBe(9);
    expect(neo4jIntegerToNumber({ low: 9, high: 0 })).toBe(9);
  });
});
