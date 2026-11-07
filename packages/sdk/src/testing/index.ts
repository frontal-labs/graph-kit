// @graph-om/sdk/src/testing/index.ts
// Testing utilities for Graph-OM - mock driver, test helpers, fixtures

import type { DriverCapabilities } from '../driver';
import type {
  DriverAdapter,
  GraphSchemaRegistry,
  QueryRecord,
  QueryResult,
  TransactionContext,
} from '../types';

export interface MockRecord extends QueryRecord {
  _data: Record<string, unknown>;
}

export interface MockDriverOptions {
  schema?: GraphSchemaRegistry;
  latency?: number; // Simulated latency in ms
  shouldFail?: boolean;
  failMessage?: string;
}

export class MockDriverAdapter implements DriverAdapter {
  private data: Map<string, Map<string, MockRecord>> = new Map();
  private schema?: GraphSchemaRegistry;
  private latency: number;
  private shouldFail: boolean;
  private failMessage: string;
  private queryLog: Array<{ query: string; params: Record<string, unknown> }> = [];
  private idCounter = 0;

  constructor(options: MockDriverOptions = {}) {
    this.schema = options.schema;
    this.latency = options.latency ?? 0;
    this.shouldFail = options.shouldFail ?? false;
    this.failMessage = options.failMessage ?? 'Mock driver error';
  }

  private async delay(): Promise<void> {
    if (this.latency > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.latency));
    }
  }

  private generateId(): string {
    return `mock_${++this.idCounter}_${Date.now()}`;
  }

  private createRecord(data: Record<string, unknown>): MockRecord {
    const keys = Object.keys(data);
    return {
      _data: data,
      keys,
      get: (key: string) => data[key],
      toObject: () => ({ ...data }),
    };
  }

  async connect(): Promise<void> {
    await this.delay();
  }

  async disconnect(): Promise<void> {
    await this.delay();
  }

  async runQuery(cypher: string, params?: Record<string, unknown>): Promise<QueryResult> {
    await this.delay();

    this.queryLog.push({ query: cypher, params: params ?? {} });

    if (this.shouldFail) {
      throw new Error(this.failMessage);
    }

    // Simple query parsing for common patterns
    const upperCypher = cypher.toUpperCase().trim();

    if (upperCypher.startsWith('CREATE')) {
      return this.handleCreate(cypher, params);
    } else if (upperCypher.startsWith('MATCH')) {
      return this.handleMatch(cypher, params);
    } else if (upperCypher.startsWith('MERGE')) {
      return this.handleMerge(cypher, params);
    } else if (upperCypher.startsWith('DELETE') || upperCypher.startsWith('DETACH DELETE')) {
      return this.handleDelete(cypher, params);
    } else if (upperCypher.startsWith('SET')) {
      return this.handleSet(cypher, params);
    }

    return { records: [], summary: this.emptySummary(), keys: [] };
  }

  private handleCreate(cypher: string, params?: Record<string, unknown>): QueryResult {
    // Extract label from CREATE (n:Label {props})
    const labelMatch = cypher.match(/CREATE\s+\(\w+:(\w+)/i);
    const label = labelMatch?.[1] ?? 'Node';

    const id = (params?.['id'] as string) ?? this.generateId();
    const recordData = { ...params, id };
    const record = this.createRecord(recordData);

    if (!this.data.has(label)) {
      this.data.set(label, new Map());
    }
    this.data.get(label)?.set(recordData.id as string, record);

    return {
      records: [record],
      summary: this.emptySummary({ nodesCreated: 1 }),
      keys: record.keys,
    };
  }

  private handleMatch(cypher: string, params?: Record<string, unknown>): QueryResult {
    // Extract label from MATCH (n:Label)
    const labelMatch = cypher.match(/MATCH\s+\(\w+:(\w+)/i);
    const label = labelMatch?.[1];

    if (!label || !this.data.has(label)) {
      return { records: [], summary: this.emptySummary(), keys: [] };
    }

    const nodes = this.data.get(label) ?? new Map<string, MockRecord>();
    let results: MockRecord[] = Array.from(nodes.values());

    // Simple WHERE clause handling
    if (cypher.includes('WHERE') && params) {
      const whereParams = params as Record<string, unknown>;
      results = results.filter((record) => {
        return Object.entries(whereParams).every(([key, value]) => {
          if (key === 'id') return record._data['id'] === String(value);
          return record._data[key] === value;
        });
      });
    }

    // LIMIT handling
    const limitMatch = cypher.match(/LIMIT\s+(\d+)/i);
    if (limitMatch?.[1]) {
      const limit = parseInt(limitMatch[1], 10);
      results = results.slice(0, limit);
    }

    // SKIP handling
    const skipMatch = cypher.match(/SKIP\s+(\d+)/i);
    if (skipMatch?.[1]) {
      const skip = parseInt(skipMatch[1], 10);
      results = results.slice(skip);
    }

    return {
      records: results,
      summary: this.emptySummary(),
      keys: results[0]?.keys ?? [],
    };
  }

  private handleMerge(cypher: string, params?: Record<string, unknown>): QueryResult {
    // Simplified MERGE - acts like CREATE or MATCH
    const labelMatch = cypher.match(/MERGE\s+\(\w+:(\w+)/i);
    const label = labelMatch?.[1] ?? 'Node';
    const id = (params?.['id'] as string) ?? this.generateId();

    if (!this.data.has(label)) {
      this.data.set(label, new Map());
    }
    const nodes = this.data.get(label) ?? new Map<string, MockRecord>();

    let record = nodes.get(id);
    if (!record) {
      const recordData = { ...params, id };
      record = this.createRecord(recordData);
      nodes.set(id, record);
    }

    return {
      records: [record],
      summary: this.emptySummary({ nodesCreated: 1 }),
      keys: record.keys,
    };
  }

  private handleDelete(cypher: string, params?: Record<string, unknown>): QueryResult {
    const labelMatch = cypher.match(/MATCH\s+\(\w+:(\w+)/i);
    const label = labelMatch?.[1];

    if (!label || !this.data.has(label)) {
      return { records: [], summary: this.emptySummary(), keys: [] };
    }

    const nodes = this.data.get(label) ?? new Map<string, MockRecord>();
    let deleted = 0;

    if (params) {
      for (const [id, record] of nodes.entries()) {
        const matches = Object.entries(params).every(([key, value]) => {
          if (key === 'id') return id === value;
          return record._data[key] === value;
        });
        if (matches) {
          nodes.delete(id);
          deleted++;
        }
      }
    }

    return {
      records: [],
      summary: this.emptySummary({ nodesDeleted: deleted }),
      keys: [],
    };
  }

  private handleSet(_cypher: string, _params?: Record<string, unknown>): QueryResult {
    // Simplified SET handling
    return { records: [], summary: this.emptySummary({ propertiesSet: 1 }), keys: [] };
  }

  private emptySummary(counters: Record<string, number> = {}): QueryResult['summary'] {
    return {
      query: { text: '', parameters: {} },
      counters: {
        nodesCreated: 0,
        nodesDeleted: 0,
        relationshipsCreated: 0,
        relationshipsDeleted: 0,
        propertiesSet: 0,
        labelsAdded: 0,
        labelsRemoved: 0,
        indexesAdded: 0,
        indexesRemoved: 0,
        constraintsAdded: 0,
        constraintsRemoved: 0,
        ...counters,
      },
      notifications: [],
      resultAvailableAfter: 0,
      resultConsumedAfter: 0,
      database: { name: 'mock' },
    };
  }

  async runInTransaction<T>(work: (txc: TransactionContext) => Promise<T>): Promise<T> {
    await this.delay();

    const mockTxc: TransactionContext = {
      run: async (query: string, params?: Record<string, unknown>) => {
        return this.runQuery(query, params);
      },
    };

    return work(mockTxc);
  }

  async runInReadTransaction<T>(work: (txc: TransactionContext) => Promise<T>): Promise<T> {
    return this.runInTransaction(work);
  }

  async verifyConnectivity(): Promise<boolean> {
    await this.delay();
    return true;
  }

  async getServerInfo(): Promise<{ address: string; version: string; protocol: string }> {
    await this.delay();
    return { address: 'mock://localhost', version: '5.0.0-mock', protocol: 'bolt' };
  }

  getCapabilities(): DriverCapabilities {
    return {
      transactions: true,
      readReplicas: false,
      boltProtocol: true,
      httpProtocol: false,
      vectorSearch: false,
      fullTextSearch: false,
      geospatial: false,
      procedures: [],
    };
  }

  // Test helpers
  getQueryLog(): Array<{ query: string; params: Record<string, unknown> }> {
    return [...this.queryLog];
  }

  clearQueryLog(): void {
    this.queryLog = [];
  }

  getData(label: string): Map<string, MockRecord> | undefined {
    return this.data.get(label);
  }

  setData(label: string, records: Record<string, unknown>[]): void {
    const map = new Map<string, MockRecord>();
    for (const record of records) {
      const id = (record['id'] as string) ?? this.generateId();
      map.set(id, this.createRecord({ ...record, id }));
    }
    this.data.set(label, map);
  }

  clearData(label?: string): void {
    if (label) {
      this.data.delete(label);
    } else {
      this.data.clear();
    }
  }

  count(label: string): number {
    return this.data.get(label)?.size ?? 0;
  }
}

export function createMockDriver(options?: MockDriverOptions): MockDriverAdapter {
  return new MockDriverAdapter(options);
}

// Test fixtures and helpers
export interface TestFixture<T = Record<string, unknown>> {
  label: string;
  data: T[];
}

export function createTestFixtures(
  fixtures: TestFixture[],
): Record<string, Record<string, unknown>[]> {
  const result: Record<string, Record<string, unknown>[]> = {};
  for (const fixture of fixtures) {
    result[fixture.label] = fixture.data;
  }
  return result;
}

export async function setupTestDatabase(
  driver: MockDriverAdapter,
  fixtures: TestFixture[],
): Promise<void> {
  for (const fixture of fixtures) {
    driver.setData(fixture.label, fixture.data);
  }
}

export async function teardownTestDatabase(driver: MockDriverAdapter): Promise<void> {
  driver.clearData();
  driver.clearQueryLog();
}

// Testcontainers integration (for integration tests)
export interface TestContainerOptions {
  image?: string;
  port?: number;
  username?: string;
  password?: string;
  database?: string;
  env?: Record<string, string>;
}

export interface TestContainerInstance {
  uri: string;
  username: string;
  password: string;
  database: string;
  stop: () => Promise<void>;
}

export async function startTestContainer(
  options: TestContainerOptions = {},
): Promise<TestContainerInstance> {
  // This would use testcontainers library in real implementation
  // For now, return a mock that expects a running Neo4j
  const _image = options.image ?? 'neo4j:5';
  const port = options.port ?? 7687;
  const username = options.username ?? 'neo4j';
  const password = options.password ?? 'password';
  const database = options.database ?? 'neo4j';

  // In real implementation:
  // const container = await new GenericContainer(image)
  //   .withExposedPorts(port)
  //   .withEnvironment({ NEO4J_AUTH: `${username}/${password}` })
  //   .start();

  // For now, assume local Neo4j is running
  console.warn('Testcontainers not fully implemented. Using local Neo4j.');

  return {
    uri: `bolt://localhost:${port}`,
    username,
    password,
    database,
    stop: async () => {},
  };
}

// Snapshot testing helpers
export interface SnapshotOptions {
  updateSnapshots?: boolean;
  snapshotDir?: string;
}

export function createSnapshotMatcher(options: SnapshotOptions = {}) {
  const { updateSnapshots = false, snapshotDir = '__snapshots__' } = options;
  const _snapshots = new Map<string, unknown>();

  return {
    async toMatchSnapshot<T>(
      name: string,
      received: T,
    ): Promise<{ pass: boolean; message: string }> {
      const fs = await import('node:fs/promises');
      const path = await import('node:path');

      const snapshotPath = path.join(process.cwd(), snapshotDir, `${name}.snap.json`);

      try {
        const content = await fs.readFile(snapshotPath, 'utf-8');
        const expected = JSON.parse(content);

        const pass = JSON.stringify(received) === JSON.stringify(expected);

        if (!pass && updateSnapshots) {
          await fs.writeFile(snapshotPath, JSON.stringify(received, null, 2));
          return { pass: true, message: 'Snapshot updated' };
        }

        return {
          pass,
          message: pass
            ? 'Snapshot matches'
            : `Snapshot mismatch. Expected: ${JSON.stringify(expected)}, Received: ${JSON.stringify(received)}`,
        };
      } catch {
        // Snapshot doesn't exist
        if (updateSnapshots) {
          await fs.mkdir(path.dirname(snapshotPath), { recursive: true });
          await fs.writeFile(snapshotPath, JSON.stringify(received, null, 2));
          return { pass: true, message: 'Snapshot created' };
        }
        return {
          pass: false,
          message: 'Snapshot not found. Run with updateSnapshots=true to create.',
        };
      }
    },
  };
}

// Property-based testing helpers
export function generateRandomString(length = 10): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export function generateRandomEmail(): string {
  return `${generateRandomString(8)}@${generateRandomString(5)}.com`;
}

export function generateRandomDate(start = new Date(2020, 0, 1), end = new Date()): Date {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

export function generateRandomInt(min = 0, max = 1000): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function generateRandomFloat(min = 0, max = 1000, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.floor(Math.random() * (max - min) * factor) / factor + min;
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

// Test data generators
export interface GeneratorOptions<T> {
  count?: number;
  factory: (index: number) => T;
}

export function generateTestData<T>(options: GeneratorOptions<T>): T[] {
  const { count = 10, factory } = options;
  return Array.from({ length: count }, (_, i) => factory(i));
}

// Vitest/Jest matchers for Graph-OM
export const graphMatchers = {
  toBeValidNode(received: unknown, label: string): { pass: boolean; message: () => string } {
    const pass =
      received !== null &&
      typeof received === 'object' &&
      'id' in received &&
      Object.keys(received).length > 0;

    return {
      pass,
      message: () =>
        pass
          ? `Expected not to be a valid ${label} node`
          : `Expected to be a valid ${label} node with id`,
    };
  },

  toHaveRelation(
    received: unknown,
    relationName: string,
  ): { pass: boolean; message: () => string } {
    const pass = received !== null && typeof received === 'object' && relationName in received;

    return {
      pass,
      message: () =>
        pass
          ? `Expected not to have relation ${relationName}`
          : `Expected to have relation ${relationName}`,
    };
  },

  toMatchCypherPattern(
    received: string,
    pattern: string,
  ): { pass: boolean; message: () => string } {
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    const pass = regex.test(received);

    return {
      pass,
      message: () =>
        pass
          ? `Expected Cypher not to match pattern ${pattern}`
          : `Expected Cypher to match pattern ${pattern}`,
    };
  },
};

// Extend Vitest expect
declare global {
  namespace Vi {
    interface Assertion<T = unknown> {
      toBeValidNode(label: string): void;
      toHaveRelation(relationName: string): void;
      toMatchCypherPattern(pattern: string): void;
    }
  }
}
