// @graph-om/sdk/tests/driver-falkordb.test.ts
// The FalkorDB adapter talks Redis through `ioredis`, so these tests replace it with a fake
// that records every command.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FalkorDBDriverAdapter } from '../src/driver/falkordb';

const fake = vi.hoisted(() => {
  type Call = { command: string; args: unknown[] };
  const state = {
    calls: [] as Call[],
    instances: [] as Array<{ options: Record<string, unknown>; quit: () => Promise<void> }>,
    queryReply: [
      [[2, 'n.name']],
      [[[2, 'Ada']]],
      ['Query internal execution time: 0.1 ms'],
    ] as unknown,
    connectError: null as Error | null,
    callError: null as Error | null,
  };
  class FakeRedis {
    options: Record<string, unknown>;
    constructor(options: Record<string, unknown>) {
      this.options = options;
      state.instances.push(this);
    }
    async connect() {
      if (state.connectError) throw state.connectError;
    }
    async quit() {}
    async call(command: string, ...args: unknown[]) {
      state.calls.push({ command, args });
      if (state.callError) throw state.callError;
      if (command === 'GRAPH.QUERY') return state.queryReply;
      if (command === 'GRAPH.RO_QUERY') {
        // CALL db.labels() and friends: one row per name, indexed by id
        const procedure = String(args[1])
          .replace(/^CALL /, '')
          .replace(/\(\)$/, '');
        return [[[2, 'name']], (state.metadata[procedure] ?? []).map((name) => [[2, name]])];
      }
      return 'OK';
    }
  }
  return { state, FakeRedis };
});

vi.mock('ioredis', () => ({ default: fake.FakeRedis }));

describe('FalkorDBDriverAdapter', () => {
  const uri = 'redis://localhost:6379';
  const { state } = fake;
  let adapter: FalkorDBDriverAdapter;

  beforeEach(() => {
    state.calls.length = 0;
    state.instances.length = 0;
    state.queryReply = [[[2, 'n.name']], [[[2, 'Ada']]], ['Query internal execution time: 0.1 ms']];
    state.metadata = {
      'db.labels': ['Person'],
      'db.relationshipTypes': ['FOLLOWS'],
      'db.propertyKeys': ['name'],
    };
    state.connectError = null;
    state.callError = null;
    adapter = new FalkorDBDriverAdapter({
      type: 'falkordb',
      uri,
      username: '',
      password: '',
      database: 'social',
    });
  });

  const lastCommands = (command: string) => state.calls.filter((c) => c.command === command);

  it('reports the capabilities FalkorDB supports', () => {
    expect(adapter.getCapabilities()).toMatchObject({
      transactions: true,
      boltProtocol: false,
      vectorSearch: true,
      fullTextSearch: true,
      procedures: ['GRAPH', 'FT', 'VECTOR'],
    });
  });

  it('connects to the host and port in the URI and selects the graph', async () => {
    await adapter.connect();

    // ioredis reads host and port at the top level
    expect(state.instances[0]?.options).toMatchObject({ host: 'localhost', port: 6379 });
  });

  it('turns a failed connect into connection_failed, keeps the message, URI and cause', async () => {
    const original = new Error('connect ECONNREFUSED 127.0.0.1:6379');
    state.connectError = original;

    const error = await adapter.connect().catch((e: unknown) => e);

    expect(error).toMatchObject({
      code: 'connection_failed',
      message: 'connect ECONNREFUSED 127.0.0.1:6379',
      statusCode: 503,
      retry: { retryable: true },
      metadata: { uri },
    });
    expect((error as { cause: unknown }).cause).toBe(original);
  });

  it('sends GRAPH.QUERY with the graph name, the query and flattened parameters', async () => {
    await adapter.connect();
    await adapter.runQuery('MATCH (n {id: $id}) RETURN n.name', { id: 'a' });

    expect(lastCommands('GRAPH.QUERY').at(-1)?.args).toEqual([
      'social',
      'CYPHER `id`="a" MATCH (n {id: $id}) RETURN n.name',
      '--compact',
    ]);
  });

  it('encodes parameter values as Cypher literals and escapes quotes', async () => {
    await adapter.connect();
    await adapter.runQuery('RETURN $a, $b, $c, $d', {
      a: 'say "hi"',
      b: [1, true, null],
      c: 2.5,
      d: { k: 'v' },
    });

    expect(lastCommands('GRAPH.QUERY').at(-1)?.args[1]).toBe(
      'CYPHER `a`="say \\"hi\\"" `b`=[1,true,null] `c`=2.5 `d`={`k`: "v"} RETURN $a, $b, $c, $d',
    );
  });

  it('maps the reply header and rows into records', async () => {
    await adapter.connect();
    const result = await adapter.runQuery('MATCH (n) RETURN n.name');

    expect(result.keys).toEqual(['n.name']);
    expect(result.records).toHaveLength(1);
    expect(result.records[0]?.get('n.name')).toBe('Ada');
  });

  it('decodes typed cells: integers, nulls, booleans, lists and maps', async () => {
    state.queryReply = [
      [
        [3, 'count'],
        [1, 'missing'],
        [4, 'active'],
        [6, 'tags'],
        [10, 'meta'],
      ],
      [
        [
          [3, '42'],
          [1, null],
          [4, 'true'],
          [
            6,
            [
              [2, 'a'],
              [2, 'b'],
            ],
          ],
          [10, ['k', [2, 'v']]],
        ],
      ],
      ['stats'],
    ];
    await adapter.connect();
    const result = await adapter.runQuery('RETURN 1');

    expect(result.keys).toEqual(['count', 'missing', 'active', 'tags', 'meta']);
    expect(result.records[0]?.toObject()).toEqual({
      count: 42,
      missing: null,
      active: true,
      tags: ['a', 'b'],
      meta: { k: 'v' },
    });
  });

  it('returns no records for a write without RETURN', async () => {
    state.queryReply = ['Nodes created: 1'];
    await adapter.connect();
    const result = await adapter.runQuery('CREATE (n:User {id: $id})', { id: 'x' });

    expect(result.records).toEqual([]);
  });

  it('decodes nodes and edges with their label, relationship and property names', async () => {
    state.queryReply = [
      [
        [8, 'n'],
        [7, 'r'],
      ],
      [
        [
          // node 7 with label id 0 (Person) and property key id 0 (name)
          [8, [7, [0], [[0, 2, 'Ada']]]],
          // edge 5 with relationship type id 0 (FOLLOWS) from node 7 to node 8
          [7, [5, 0, 7, 8, [[0, 2, 'since']]]],
        ],
      ],
      ['stats'],
    ];
    await adapter.connect();
    const [row] = (await adapter.runQuery('MATCH (n)-[r]->(m) RETURN n, r')).records;

    expect(row?.get('n')).toEqual({ id: 7, labels: ['Person'], properties: { name: 'Ada' } });
    expect(row?.get('r')).toEqual({
      id: 5,
      relationshipType: 'FOLLOWS',
      sourceId: 7,
      destinationId: 8,
      properties: { name: 'since' },
    });
  });

  it('reads names again when an id is not in the cached names', async () => {
    state.queryReply = [[[8, 'n']], [[[8, [1, [0], []]]]], ['stats']];
    await adapter.connect();
    await adapter.runQuery('MATCH (n) RETURN n');

    // A label created since the names were read gets the next id
    state.metadata['db.labels'] = ['Person', 'Company'];
    state.queryReply = [[[8, 'n']], [[[8, [2, [1], []]]]], ['stats']];
    const [row] = (await adapter.runQuery('MATCH (n:Company) RETURN n')).records;

    expect(row?.get('n')).toMatchObject({ labels: ['Company'] });
  });

  it('refuses queries before connect with driver_not_connected', async () => {
    await expect(adapter.runQuery('MATCH (n) RETURN n')).rejects.toMatchObject({
      code: 'driver_not_connected',
      statusCode: 500,
    });
  });

  it('classifies a failed command as query_failed and keeps the cause', async () => {
    await adapter.connect();
    const original = new Error('ERR unknown command');
    state.callError = original;

    const error = await adapter.runQuery('MATCH (n) RETURN n').catch((e: unknown) => e);

    expect(error).toMatchObject({ code: 'query_failed' });
    expect((error as { cause: unknown }).cause).toBe(original);
  });

  it('runs a successful transaction as MULTI, the queries, then EXEC', async () => {
    await adapter.connect();
    await adapter.runInTransaction(async (tx) => {
      await tx.run('CREATE (n:User {id: $id})', { id: 'x' });
      return 'ok';
    });

    const commands = state.calls.map((c) => c.command);
    expect(commands.slice(-3)).toEqual(['MULTI', 'GRAPH.QUERY', 'EXEC']);
  });

  it('rethrows the caller error unchanged and discards the transaction', async () => {
    await adapter.connect();
    const userError = new Error('payment provider timed out');

    await expect(
      adapter.runInTransaction(async () => {
        throw userError;
      }),
    ).rejects.toBe(userError);

    expect(state.calls.map((c) => c.command)).toContain('DISCARD');
  });
});
