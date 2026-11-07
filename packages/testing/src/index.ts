// @graph-om/testing/src/index.ts
// Testing utilities for Graph-OM - mock driver, test helpers, fixtures

import type {
  DriverAdapter,
  QueryRecord,
  QueryResult,
  TransactionContext,
} from '@graph-om/graph-om';

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
      const limit = limitMatch ? parseInt(limitMatch[1], 10) : 100;

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

  mockQuery(_cypher: string, _records: any[], _params?: Record<string, unknown>): void {
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

// Vitest/Jest matchers for Graph-OM
export const graphMatchers = {
  toBeValidNode: (node: any, expectedLabel?: string) => {
    if (!node || typeof node !== 'object') {
      return { pass: false, message: () => 'Expected a valid node object' };
    }
    if (expectedLabel && node.label !== expectedLabel) {
      return {
        pass: false,
        message: () => `Expected node label ${expectedLabel}, got ${node.label}`,
      };
    }
    return { pass: true, message: () => 'Valid node' };
  },

  toHaveRelation: (node: any, relationName: string) => {
    if (!node?.relations?.[relationName]) {
      return { pass: false, message: () => `Expected node to have relation ${relationName}` };
    }
    return { pass: true, message: () => 'Has relation' };
  },

  toMatchCypherPattern: (cypher: string, pattern: string | RegExp) => {
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    const matches = regex.test(cypher);
    return {
      pass: matches,
      message: () => `Expected Cypher to ${matches ? 'not ' : ''}match pattern`,
    };
  },
};

// Test fixtures
export interface TestFixture {
  name: string;
  data: Record<string, unknown>[];
}

export function createTestFixtures(): {
  createUserFactory: () => (index: number) => Record<string, unknown>;
  createPostFactory: () => (index: number) => Record<string, unknown>;
  createRelationFactory: () => (
    fromId: string,
    toId: string,
    type: string,
  ) => Record<string, unknown>;
} {
  return {
    createUserFactory: () => {
      const _counter = 0;
      return (index: number) => ({
        id: `user-${index}`,
        name: `User ${index}`,
        email: `user${index}@example.com`,
        age: 20 + (index % 50),
        createdAt: new Date(),
      });
    },
    createPostFactory: () => {
      const _counter = 0;
      return (index: number) => ({
        id: `post-${index}`,
        title: `Post ${index}`,
        content: `Content for post ${index}`,
        published: index % 2 === 0,
        createdAt: new Date(),
      });
    },
    createRelationFactory: () => {
      return (fromId: string, toId: string, type: string) => ({
        from: fromId,
        to: toId,
        type,
        createdAt: new Date(),
      });
    },
  };
}

export function generateTestData<T>({
  count,
  factory,
}: {
  count: number;
  factory: (index: number) => T;
}): T[] {
  return Array.from({ length: count }, (_, i) => factory(i));
}

export function generateRandomString(length = 10): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function generateRandomEmail(): string {
  return `${generateRandomString(8)}@example.com`;
}

export function generateRandomDate(start = new Date(2020, 0, 1), end = new Date()): Date {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

export function generateRandomInt(min = 0, max = 100): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function generateRandomFloat(min = 0, max = 100): number {
  return Math.random() * (max - min) + min;
}

export function generateRandomBoolean(): boolean {
  return Math.random() > 0.5;
}

export function generateRandomUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Export types
export type {
  DriverAdapter,
  DriverCapabilities,
  GraphConfig,
  GraphSchemaRegistry,
  NodeConfig,
  PropertyConfig,
  QueryRecord,
  QueryResult,
  RelationConfig,
  TransactionContext,
  WhereCondition,
} from '@graph-om/graph-om';
