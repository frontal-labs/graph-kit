// @graph-om/neo4j/tests/driver-adapter.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Neo4jDriverAdapter } from '../src/index';

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
