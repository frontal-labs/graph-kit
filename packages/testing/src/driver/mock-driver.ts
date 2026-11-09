// @graph-kit/testing/src/driver/mock-driver.ts
// Mock DriverAdapter implementation for testing without a live database

import type {
  DriverAdapter,
  DriverCapabilities,
  QueryRecord,
  QueryResult,
  TransactionContext,
} from '@graph-kit/sdk';

export class MockDriverAdapter implements DriverAdapter {
  private data: Map<string, Map<string, Record<string, unknown>>> = new Map();
  private queryLog: Array<{ cypher: string; params?: Record<string, unknown> }> = [];
  private shouldThrow = false;
  private throwError: Error | null = null;

  setShouldThrow(shouldThrow: boolean, error?: Error): void {
    this.shouldThrow = shouldThrow;
    this.throwError = error ?? new Error('Mock driver error');
  }

  async connect(): Promise<void> {
    if (this.shouldThrow) throw this.throwError;
  }

  async disconnect(): Promise<void> {
    this.data.clear();
    this.queryLog = [];
  }

  async runQuery(cypher: string, params?: Record<string, unknown>): Promise<QueryResult> {
    this.queryLog.push({ cypher, params });

    if (this.shouldThrow) throw this.throwError;

    // Simple mock implementation
    if (cypher.includes('MATCH (n:') && cypher.includes('RETURN n')) {
      const labelMatch = cypher.match(/MATCH \(n:(\w+)\)/);
      const label = labelMatch?.[1] ?? 'Node';
      const limitMatch = cypher.match(/LIMIT\s+(\d+)/);
      const limit = limitMatch?.[1] ? parseInt(limitMatch[1], 10) : 100;

      const nodes = this.data.get(label) ?? new Map();
      const records = Array.from(nodes.values())
        .slice(0, limit)
        .map((node) => this.createRecord(node));

      return {
        records,
        summary: {
          query: { text: cypher, parameters: params ?? {} },
          counters: {},
          notifications: [],
          resultAvailableAfter: 0,
          resultConsumedAfter: 0,
          database: { name: 'mock' },
        },
        keys: ['n'],
      };
    }

    if (cypher.includes('CREATE')) {
      return {
        records: [],
        summary: {
          query: { text: cypher, parameters: params ?? {} },
          counters: { nodesCreated: 1 },
          notifications: [],
          resultAvailableAfter: 0,
          resultConsumedAfter: 0,
          database: { name: 'mock' },
        },
        keys: [],
      };
    }

    if (cypher.includes('DELETE') || cypher.includes('DETACH DELETE')) {
      return {
        records: [],
        summary: {
          query: { text: cypher, parameters: params ?? {} },
          counters: { nodesDeleted: 1 },
          notifications: [],
          resultAvailableAfter: 0,
          resultConsumedAfter: 0,
          database: { name: 'mock' },
        },
        keys: [],
      };
    }

    return {
      records: [],
      summary: {
        query: { text: cypher, parameters: params ?? {} },
        counters: {},
        notifications: [],
        resultAvailableAfter: 0,
        resultConsumedAfter: 0,
        database: { name: 'mock' },
      },
      keys: [],
    };
  }

  async runInTransaction<T>(work: (txc: TransactionContext) => Promise<T>): Promise<T> {
    return work(this.createTransactionContext());
  }

  async runInReadTransaction<T>(work: (txc: TransactionContext) => Promise<T>): Promise<T> {
    return work(this.createTransactionContext());
  }

  async verifyConnectivity(): Promise<boolean> {
    return true;
  }

  async getServerInfo(): Promise<{ address: string; version: string; protocol: string }> {
    return {
      address: 'mock://localhost',
      version: 'mock',
      protocol: 'mock',
    };
  }

  getCapabilities(): DriverCapabilities {
    return {
      transactions: true,
      readReplicas: false,
      boltProtocol: false,
      httpProtocol: false,
      vectorSearch: false,
      fullTextSearch: false,
      geospatial: false,
      procedures: [],
    };
  }

  private createTransactionContext(): TransactionContext {
    return {
      run: async (query: string, params?: Record<string, unknown>): Promise<QueryResult> => {
        return this.runQuery(query, params);
      },
    };
  }

  getQueryCount(cypher: string): number {
    return this.queryLog.filter((q) => q.cypher === cypher).length;
  }

  mockQuery(_cypher: string, _records: unknown[], _params?: Record<string, unknown>): void {
    // This would be used to mock specific query responses
  }

  private createRecord(data: Record<string, unknown>): QueryRecord {
    const obj = { ...data };
    return {
      keys: Object.keys(obj),
      get: (key: string) => obj[key],
      toObject: () => ({ ...obj }),
    };
  }
}

export function createMockDriver(): MockDriverAdapter {
  return new MockDriverAdapter();
}
