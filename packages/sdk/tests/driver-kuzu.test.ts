// @graph-kit/sdk/tests/driver-kuzu.test.ts
// Kuzu is an embedded database loaded at runtime. These tests replace the `kuzu` module with an
// in-memory fake that records every statement, so the adapter's own logic is what gets tested.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createKuzuDriver, createKuzuDriverAsync } from '../src/driver/index';

const fake = vi.hoisted(() => {
  type Row = Record<string, unknown>;
  type Statement = { cypher: string; params?: Record<string, unknown> };
  const state = {
    statements: [] as Statement[],
    rowsFor: (_cypher: string): Row[] => [],
    queryError: null as Error | null,
    connectError: null as Error | null,
    databasePaths: [] as string[],
    connectionsClosed: 0,
    databasesClosed: 0,
  };

  // The result shape the adapter reads: async column names and rows as objects
  function makeResult(rows: Row[]) {
    const columns = rows.length > 0 ? Object.keys(rows[0] as object) : [];
    return {
      getColumnNames: async () => columns,
      getAll: async () => rows,
    };
  }

  // Like the real package: parameters only go through prepare and execute
  class FakeConnection {
    async query(cypher: string) {
      state.statements.push({ cypher });
      if (state.queryError) throw state.queryError;
      return makeResult(state.rowsFor(cypher));
    }
    async prepare(cypher: string) {
      return { cypher };
    }
    async execute(prepared: { cypher: string }, params: Record<string, unknown>) {
      state.statements.push({ cypher: prepared.cypher, params });
      if (state.queryError) throw state.queryError;
      return makeResult(state.rowsFor(prepared.cypher));
    }
    async close() {
      state.connectionsClosed++;
    }
  }

  class FakeDatabase {
    constructor(path: string) {
      if (state.connectError) throw state.connectError;
      state.databasePaths.push(path);
    }
    async init() {}
    async close() {
      state.databasesClosed++;
    }
  }

  return { state, FakeDatabase, FakeConnection };
});

vi.mock('kuzu', () => ({ Database: fake.FakeDatabase, Connection: fake.FakeConnection }));

describe('KuzuDriverAdapter', () => {
  const { state } = fake;
  const config = {
    type: 'kuzu' as const,
    databasePath: '/tmp/graph.kuzu',
    uri: '',
    username: '',
    password: '',
  };

  beforeEach(() => {
    state.statements.length = 0;
    state.rowsFor = () => [];
    state.queryError = null;
    state.connectError = null;
    state.databasePaths.length = 0;
    state.connectionsClosed = 0;
    state.databasesClosed = 0;
  });

  it('refuses the synchronous factory and points to the async one', () => {
    expect(() => createKuzuDriver(config)).toThrow(
      expect.objectContaining({ code: 'unsupported_option' }),
    );
  });

  it('reports embedded transaction support', async () => {
    const driver = await createKuzuDriverAsync(config);
    expect(driver.getCapabilities()).toMatchObject({ transactions: true, boltProtocol: false });
  });

  it('opens the database file on connect and closes it on disconnect', async () => {
    const driver = await createKuzuDriverAsync(config);
    await driver.connect();
    await driver.disconnect();

    expect(state.databasePaths).toEqual(['/tmp/graph.kuzu']);
    expect(state.connectionsClosed).toBe(1);
    expect(state.databasesClosed).toBe(1);
  });

  it('maps result rows into records', async () => {
    state.rowsFor = () => [{ 'n.name': 'Ada' }];
    const driver = await createKuzuDriverAsync(config);
    await driver.connect();

    const result = await driver.runQuery('MATCH (n) RETURN n.name');

    expect(result.keys).toEqual(['n.name']);
    expect(result.records[0]?.get('n.name')).toBe('Ada');
  });

  it('sends parameters through a prepared statement, not as loose arguments', async () => {
    const driver = await createKuzuDriverAsync(config);
    await driver.connect();
    await driver.runQuery('MATCH (n:User {id: $id}) RETURN n.id', { id: 'x' });

    expect(state.statements.at(-1)).toEqual({
      cypher: 'MATCH (n:User {id: $id}) RETURN n.id',
      params: { id: 'x' },
    });
  });

  it('refuses queries before connect with driver_not_connected', async () => {
    const driver = await createKuzuDriverAsync(config);
    await expect(driver.runQuery('MATCH (n) RETURN n')).rejects.toMatchObject({
      code: 'driver_not_connected',
    });
  });

  it('turns a failed open into connection_failed with the path and cause', async () => {
    const original = new Error('database is locked');
    state.connectError = original;
    const driver = await createKuzuDriverAsync(config);

    const error = await driver.connect().catch((e: unknown) => e);

    expect(error).toMatchObject({
      code: 'connection_failed',
      message: 'database is locked',
      statusCode: 503,
      retry: { retryable: true },
      metadata: { databasePath: '/tmp/graph.kuzu' },
    });
    expect((error as { cause: unknown }).cause).toBe(original);
  });

  it('classifies a failed query as query_failed and keeps the cause', async () => {
    const original = new Error('Binder exception: unknown property');
    const driver = await createKuzuDriverAsync(config);
    await driver.connect();
    state.queryError = original;

    const error = await driver.runQuery('MATCH (n) RETURN n.missing').catch((e: unknown) => e);

    expect(error).toMatchObject({ code: 'query_failed' });
    expect((error as { cause: unknown }).cause).toBe(original);
  });

  it('lets a transaction read its own writes, between BEGIN and COMMIT', async () => {
    state.rowsFor = (cypher) => (cypher.startsWith('MATCH') ? [{ 'u.id': 'x' }] : []);
    const driver = await createKuzuDriverAsync(config);
    await driver.connect();

    const seen = await driver.runInTransaction(async (tx) => {
      await tx.run('CREATE (u:User {id: $id})', { id: 'x' });
      const read = await tx.run('MATCH (u:User {id: $id}) RETURN u.id', { id: 'x' });
      return read.records.map((r) => r.get('u.id'));
    });

    expect(seen).toEqual(['x']);
    expect(state.statements.map((s) => s.cypher)).toEqual([
      'BEGIN TRANSACTION',
      'CREATE (u:User {id: $id})',
      'MATCH (u:User {id: $id}) RETURN u.id',
      'COMMIT',
    ]);
  });

  it('rolls back and classifies a driver error raised inside the transaction', async () => {
    const driver = await createKuzuDriverAsync(config);
    await driver.connect();
    const original = new Error('Runtime exception: constraint violated');

    const error = await driver
      .runInTransaction(async (tx) => {
        state.queryError = original;
        await tx.run('CREATE (u:User {id: $id})', { id: 'x' });
      })
      .catch((e: unknown) => e);

    expect(error).toMatchObject({ code: 'query_failed' });
    expect((error as { cause: unknown }).cause).toBe(original);
    expect(state.statements.map((s) => s.cypher)).toContain('ROLLBACK');
  });

  it('rolls back and rethrows the caller error unchanged', async () => {
    const driver = await createKuzuDriverAsync(config);
    await driver.connect();
    const userError = new Error('payment provider timed out');

    await expect(
      driver.runInTransaction(async () => {
        throw userError;
      }),
    ).rejects.toBe(userError);

    expect(state.statements.map((s) => s.cypher)).toContain('ROLLBACK');
  });
});
