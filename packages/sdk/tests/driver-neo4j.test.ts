// @graph-om/sdk/tests/driver-neo4j.test.ts

import neo4j from 'neo4j-driver';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { Neo4jDriverAdapter } from '../src/driver/neo4j';

vi.mock('neo4j-driver', () => {
  const mockRecord = {
    keys: ['n'],
    get: vi.fn((key: string) => {
      if (key === 'n') return { id: 'abc-123', name: 'Alice', properties: {} };
      return null;
    }),
  };

  const mockCounters = {
    nodesCreated: vi.fn(() => 1),
    nodesDeleted: vi.fn(() => 0),
    relationshipsCreated: vi.fn(() => 0),
    relationshipsDeleted: vi.fn(() => 0),
    propertiesSet: vi.fn(() => 1),
    labelsAdded: vi.fn(() => 0),
    labelsRemoved: vi.fn(() => 0),
    indexesAdded: vi.fn(() => 0),
    indexesRemoved: vi.fn(() => 0),
    constraintsAdded: vi.fn(() => 0),
    constraintsRemoved: vi.fn(() => 0),
  };

  const mockResult = {
    records: [mockRecord],
    summary: {
      query: { text: 'MATCH (n) RETURN n', parameters: {} },
      counters: mockCounters,
      notifications: [],
      resultAvailableAfter: { toNumber: () => 0, low: 0 },
      resultConsumedAfter: { toNumber: () => 0, low: 0 },
      database: { name: 'neo4j' },
    },
    keys: ['n'],
  };

  const mockSession = {
    run: vi.fn().mockResolvedValue(mockResult),
    close: vi.fn().mockResolvedValue(undefined),
    executeWrite: vi.fn().mockImplementation(async (work: (txc: unknown) => Promise<unknown>) => {
      const txc = {
        run: vi.fn().mockResolvedValue(mockResult),
      };
      return await work(txc);
    }),
    executeRead: vi.fn().mockImplementation(async (work: (txc: unknown) => Promise<unknown>) => {
      const txc = {
        run: vi.fn().mockResolvedValue(mockResult),
      };
      return await work(txc);
    }),
  };

  const mockDriver = {
    session: vi.fn(() => mockSession),
    close: vi.fn().mockResolvedValue(undefined),
    getServerInfo: vi.fn().mockResolvedValue({
      address: 'bolt://localhost:7687',
      version: 'Neo4j/5.14.0',
      protocolVersion: '5.0',
    }),
    verifyConnectivity: vi.fn().mockResolvedValue(true),
  };

  return {
    default: {
      driver: vi.fn(() => mockDriver),
      auth: {
        basic: vi.fn((user: string, pass: string) => ({ user, pass })),
      },
      session: {
        WRITE: 'WRITE',
        READ: 'READ',
      },
    },
    driver: vi.fn(() => mockDriver),
    auth: {
      basic: vi.fn((user: string, pass: string) => ({ user, pass })),
    },
    session: {
      WRITE: 'WRITE',
      READ: 'READ',
    },
  };
});

describe('Neo4jDriverAdapter', () => {
  let adapter: Neo4jDriverAdapter;

  beforeEach(() => {
    adapter = new Neo4jDriverAdapter({
      type: 'neo4j',
      uri: 'bolt://localhost:7687',
      username: 'neo4j',
      password: 'test-password',
    });
  });

  describe('connect', () => {
    it('connects successfully', async () => {
      await expect(adapter.connect()).resolves.not.toThrow();
    });

    it('does not reconnect if already connected', async () => {
      await adapter.connect();
      await adapter.connect();
    });
  });

  describe('runQuery', () => {
    it('executes a query and returns results', async () => {
      await adapter.connect();
      const result = await adapter.runQuery('MATCH (n:User) RETURN n LIMIT 10');

      expect(result).toBeDefined();
      expect(result.records).toHaveLength(1);
      expect(result.keys).toContain('n');
    });

    it('accepts parameters', async () => {
      await adapter.connect();
      const result = await adapter.runQuery('MATCH (n:User {id: $id}) RETURN n', { id: 'test-id' });

      expect(result).toBeDefined();
    });

    it('returns records with get method', async () => {
      await adapter.connect();
      const result = await adapter.runQuery('MATCH (n:User) RETURN n');

      const value = result.records[0]?.get('n');
      expect(value).toBeDefined();
    });

    it('returns records with toObject method', async () => {
      await adapter.connect();
      const result = await adapter.runQuery('MATCH (n:User) RETURN n');

      const obj = result.records[0]?.toObject();
      expect(obj).toBeDefined();
    });

    it('includes query summary', async () => {
      await adapter.connect();
      const result = await adapter.runQuery('MATCH (n:User) RETURN n');

      expect(result.summary).toBeDefined();
      expect(result.summary.query.text).toBeDefined();
      expect(result.summary.counters).toBeDefined();
    });
  });

  describe('runInTransaction', () => {
    it('executes work inside a write transaction', async () => {
      await adapter.connect();
      const result = await adapter.runInTransaction(async (txc) => {
        return await txc.run('CREATE (n:TestNode) RETURN n');
      });

      expect(result).toBeDefined();
      expect(result.records).toHaveLength(1);
    });
  });

  describe('runInReadTransaction', () => {
    it('executes work inside a read transaction', async () => {
      await adapter.connect();
      const result = await adapter.runInReadTransaction(async (txc) => {
        return await txc.run('MATCH (n) RETURN n LIMIT 1');
      });

      expect(result).toBeDefined();
    });
  });

  describe('verifyConnectivity', () => {
    it('returns true when connected', async () => {
      await adapter.connect();
      const result = await adapter.verifyConnectivity();
      expect(result).toBe(true);
    });

    it('returns false when not connected', async () => {
      const result = await adapter.verifyConnectivity();
      expect(result).toBe(false);
    });
  });

  describe('getServerInfo', () => {
    it('returns server information when connected', async () => {
      await adapter.connect();
      const info = await adapter.getServerInfo();

      expect(info.address).toBe('bolt://localhost:7687');
      expect(info.version).toBe('Neo4j/5.14.0');
      expect(info.protocol).toBe('5.0');
    });

    it('throws when not connected', async () => {
      await expect(adapter.getServerInfo()).rejects.toThrow();
    });
  });

  describe('disconnect', () => {
    it('disconnects gracefully', async () => {
      await adapter.connect();
      await expect(adapter.disconnect()).resolves.not.toThrow();
    });

    it('handles double disconnect', async () => {
      await adapter.connect();
      await adapter.disconnect();
      await expect(adapter.disconnect()).resolves.not.toThrow();
    });
  });

  describe('error handling', () => {
    it('throws descriptive error when running query without connection', async () => {
      await expect(adapter.runQuery('MATCH (n) RETURN n')).rejects.toThrow(
        'Neo4j driver not connected',
      );
      await expect(adapter.runQuery('MATCH (n) RETURN n')).rejects.toMatchObject({
        code: 'driver_not_connected',
        statusCode: 500,
      });
    });

    it('throws descriptive error when getting driver without connection', () => {
      expect(() => adapter.getDriver()).toThrow('Neo4j driver not connected');
      expect(() => adapter.getDriver()).toThrow(
        expect.objectContaining({ code: 'driver_not_connected' }),
      );
    });
  });

  describe('session', () => {
    it('creates a write session by default', async () => {
      await adapter.connect();
      const session = adapter.session();
      expect(session).toBeDefined();
      session.close();
    });

    it('creates a read session when specified', async () => {
      await adapter.connect();
      const session = adapter.session({ mode: 'READ' });
      expect(session).toBeDefined();
      session.close();
    });
  });
});

describe('Neo4jDriverAdapter error classification', () => {
  const uri = 'bolt://localhost:7687';
  let adapter: Neo4jDriverAdapter;

  const driverError = (code: string, message = 'driver said no') =>
    Object.assign(new Error(message), { code });

  // The mocked driver hands out the same session object every time, so tests can
  // make its next run or transaction fail.
  const session = () =>
    adapter.getDriver().session() as unknown as {
      run: Mock;
      executeWrite: Mock;
      executeRead: Mock;
    };

  beforeEach(async () => {
    vi.clearAllMocks();
    adapter = new Neo4jDriverAdapter({ type: 'neo4j', uri, username: 'neo4j', password: 'pw' });
    await adapter.connect();
  });

  it('maps a syntax error from runQuery to query_syntax_error and keeps the driver error', async () => {
    const original = driverError('Neo.ClientError.Statement.SyntaxError', 'Invalid input');
    session().run.mockRejectedValueOnce(original);

    const error = await adapter.runQuery('MATCH (n RETURN n').catch((e: unknown) => e);

    expect(error).toMatchObject({ code: 'query_syntax_error', statusCode: 400 });
    expect((error as { cause: unknown }).cause).toBe(original);
    expect((error as { metadata: unknown }).metadata).toEqual({
      driverCode: 'Neo.ClientError.Statement.SyntaxError',
    });
    expect((error as { attributes: unknown }).attributes).toEqual({ 'db.system': 'neo4j' });
  });

  it('maps a constraint violation from runQuery to constraint_violation', async () => {
    session().run.mockRejectedValueOnce(
      driverError('Neo.ClientError.Schema.ConstraintValidationFailed'),
    );

    await expect(adapter.runQuery('CREATE (n:User {id: $id})', { id: 'x' })).rejects.toMatchObject({
      code: 'constraint_violation',
      statusCode: 409,
      retry: { retryable: false },
    });
  });

  it('marks transient driver errors as retryable', async () => {
    session().run.mockRejectedValueOnce(
      driverError('Neo.TransientError.Transaction.DeadlockDetected'),
    );

    await expect(adapter.runQuery('MATCH (n) RETURN n')).rejects.toMatchObject({
      code: 'transient_failure',
      retry: { retryable: true },
    });
  });

  it('never copies query parameters into the error', async () => {
    session().run.mockRejectedValueOnce(driverError('Neo.ClientError.Statement.SyntaxError'));

    const error = await adapter
      .runQuery('MATCH (n {password: $pw}) RETURN n', { pw: 'hunter2' })
      .catch((e: unknown) => e);

    expect(JSON.stringify((error as { metadata: unknown }).metadata ?? {})).not.toContain(
      'hunter2',
    );
  });

  it('reports a failed connect as connection_failed, keeps the URI in metadata and the cause', async () => {
    const original = new Error('ECONNREFUSED 10.0.0.1:7687');
    vi.mocked(neo4j.driver).mockImplementationOnce(() => {
      throw original;
    });
    const fresh = new Neo4jDriverAdapter({ type: 'neo4j', uri, username: 'neo4j', password: 'pw' });

    const error = await fresh.connect().catch((e: unknown) => e);

    expect(error).toMatchObject({
      code: 'connection_failed',
      message: 'Failed to connect to Neo4j',
      statusCode: 503,
      retry: { retryable: true },
      metadata: { uri },
    });
    expect((error as { cause: unknown }).cause).toBe(original);
    expect(() => fresh.getDriver()).toThrow(
      expect.objectContaining({ code: 'driver_not_connected' }),
    );
  });

  it('rethrows an error thrown by the user callback unchanged', async () => {
    const userError = new Error('payment provider timed out');
    session().executeWrite.mockImplementationOnce(
      async (work: (txc: unknown) => Promise<unknown>) => work({ run: vi.fn() }),
    );

    await expect(
      adapter.runInTransaction(async () => {
        throw userError;
      }),
    ).rejects.toBe(userError);
  });

  it('passes a graph-om error from the user callback through unchanged', async () => {
    session().executeWrite.mockImplementationOnce(
      async (work: (txc: unknown) => Promise<unknown>) => work({ run: vi.fn() }),
    );
    const { GraphError } = await import('@graph-om/sdk/errors');
    const own = new GraphError('own', { code: 'invalid_argument', statusCode: 400 });

    await expect(
      adapter.runInTransaction(async () => {
        throw own;
      }),
    ).rejects.toBe(own);
  });

  it('classifies a driver error raised inside the transaction', async () => {
    const original = driverError('Neo.ClientError.Schema.ConstraintValidationFailed');
    session().executeWrite.mockImplementationOnce(
      async (work: (txc: unknown) => Promise<unknown>) =>
        work({ run: vi.fn().mockRejectedValue(original) }),
    );

    const error = await adapter
      .runInTransaction((tx) => tx.run('CREATE (n:User {id: $id})', { id: 'x' }))
      .catch((e: unknown) => e);

    expect(error).toMatchObject({ code: 'constraint_violation' });
    expect((error as { cause: unknown }).cause).toBe(original);
  });
});
