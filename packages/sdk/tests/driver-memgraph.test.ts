// @graph-om/sdk/tests/driver-memgraph.test.ts
// The Memgraph adapter speaks Bolt through the Neo4j adapter, so these tests replace that
// adapter with a stub and check what Memgraph passes through and how it translates settings.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemgraphDriverAdapter } from '../src/driver/memgraph';
import { createNeo4jDriver } from '../src/driver/neo4j';

vi.mock('../src/driver/neo4j', () => ({ createNeo4jDriver: vi.fn() }));

function stubNeo4jAdapter() {
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    runQuery: vi.fn().mockResolvedValue({ records: [], keys: [] }),
    runInTransaction: vi.fn(async (work: (txc: unknown) => Promise<unknown>) => work({})),
    runInReadTransaction: vi.fn(async (work: (txc: unknown) => Promise<unknown>) => work({})),
    verifyConnectivity: vi.fn().mockResolvedValue(true),
    getServerInfo: vi
      .fn()
      .mockResolvedValue({ address: 'bolt://m:7687', version: '5.0', protocol: 'bolt' }),
  };
}

describe('MemgraphDriverAdapter', () => {
  let stub: ReturnType<typeof stubNeo4jAdapter>;
  let adapter: MemgraphDriverAdapter;

  const config = {
    type: 'memgraph' as const,
    uri: 'bolt://localhost:7687',
    username: 'memgraph',
    password: 'secret',
    database: 'memgraph',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    stub = stubNeo4jAdapter();
    vi.mocked(createNeo4jDriver).mockReturnValue(stub as never);
    adapter = new MemgraphDriverAdapter(config);
  });

  it('hands the connection settings to the Bolt adapter', () => {
    expect(createNeo4jDriver).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'neo4j',
        uri: config.uri,
        username: config.username,
        password: config.password,
        database: config.database,
      }),
    );
  });

  it('reports Memgraph capabilities', () => {
    expect(adapter.getCapabilities()).toMatchObject({
      transactions: true,
      boltProtocol: true,
      vectorSearch: true,
      fullTextSearch: false,
      procedures: ['mg', 'mgp'],
    });
  });

  it('delegates connect and disconnect', async () => {
    await adapter.connect();
    await adapter.disconnect();
    expect(stub.connect).toHaveBeenCalledTimes(1);
    expect(stub.disconnect).toHaveBeenCalledTimes(1);
  });

  it('delegates queries with their parameters', async () => {
    await adapter.runQuery('MATCH (n) RETURN n', { id: 'a' });
    expect(stub.runQuery).toHaveBeenCalledWith('MATCH (n) RETURN n', { id: 'a' });
  });

  it('delegates both transaction kinds', async () => {
    const work = vi.fn(async () => 'done');
    await expect(adapter.runInTransaction(work)).resolves.toBe('done');
    await expect(adapter.runInReadTransaction(work)).resolves.toBe('done');
    expect(stub.runInTransaction).toHaveBeenCalledWith(work);
    expect(stub.runInReadTransaction).toHaveBeenCalledWith(work);
  });

  it('reports connectivity as true or false, never throwing', async () => {
    await expect(adapter.verifyConnectivity()).resolves.toBe(true);
    stub.verifyConnectivity.mockResolvedValueOnce(false);
    await expect(adapter.verifyConnectivity()).resolves.toBe(false);
  });

  it('propagates a failed query unchanged', async () => {
    const failure = Object.assign(new Error('boom'), { code: 'Neo.TransientError.General' });
    stub.runQuery.mockRejectedValueOnce(failure);
    await expect(adapter.runQuery('MATCH (n) RETURN n')).rejects.toBe(failure);
  });
});
