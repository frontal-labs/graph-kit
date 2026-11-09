// @graph-kit/sdk/src/seed/index.ts
// Seed/Fixture system for Graph-Kit - database seeding and test data generation

import { raiseGraphError } from '../errors';
import type { AnyNodeConfig, DriverAdapter, GraphSchemaRegistry } from '../types';

export interface SeedConfig {
  driver: DriverAdapter;
  schema?: GraphSchemaRegistry;
  batchSize?: number;
  clearBeforeSeed?: boolean;
}

export interface SeedData {
  [label: string]: Array<Record<string, unknown>>;
}

export type FixtureFactory<T = Record<string, unknown>> = (
  overrides?: Partial<T>,
  index?: number,
) => T;

export interface SeedOptions {
  count?: number;
  factories?: Record<string, FixtureFactory>;
  dependencies?: string[];
  clearExisting?: boolean;
}

export interface BulkInsertResult {
  label: string;
  created: number;
  failed: number;
  errors: Array<{ data: Record<string, unknown>; error: Error }>;
}

export class SeedManager {
  private driver: DriverAdapter;
  private schema?: GraphSchemaRegistry;
  private batchSize: number;
  private clearBeforeSeed: boolean;
  private factories: Map<string, FixtureFactory> = new Map();
  private seedOrder: string[] = [];

  constructor(config: SeedConfig) {
    this.driver = config.driver;
    this.schema = config.schema;
    this.batchSize = config.batchSize ?? 100;
    this.clearBeforeSeed = config.clearBeforeSeed ?? false;
  }

  registerFactory<T>(label: string, factory: FixtureFactory<T>): void {
    this.factories.set(label, factory as FixtureFactory);
  }

  registerFactories(factories: Record<string, FixtureFactory>): void {
    for (const [label, factory] of Object.entries(factories)) {
      this.registerFactory(label, factory);
    }
  }

  setSeedOrder(order: string[]): void {
    this.seedOrder = order;
  }

  async seed(data: SeedData, options: SeedOptions = {}): Promise<BulkInsertResult[]> {
    const results: BulkInsertResult[] = [];

    // Determine seed order
    const labels = options.dependencies
      ? this.resolveDependencies(data, options.dependencies)
      : this.seedOrder.length > 0
        ? this.seedOrder.filter((l) => data[l])
        : Object.keys(data);

    // Clear existing data if requested
    if (options.clearExisting ?? this.clearBeforeSeed) {
      for (const label of [...labels].reverse()) {
        await this.clearLabel(label);
      }
    }

    // Seed each label in order
    for (const label of labels) {
      const records = data[label];
      if (!records || records.length === 0) continue;

      const result = await this.bulkInsert(label, records);
      results.push(result);
    }

    return results;
  }

  async seedWithFactories(
    counts: Record<string, number>,
    options: SeedOptions = {},
  ): Promise<BulkInsertResult[]> {
    const data: SeedData = {};

    for (const [label, count] of Object.entries(counts)) {
      const factory = this.factories.get(label);
      if (!factory) {
        raiseGraphError(`No factory registered for label: ${label}`, {
          code: 'invalid_argument',
          statusCode: 400,
          metadata: { label },
        });
      }
      data[label] = Array.from({ length: count }, (_, i) => factory({}, i));
    }

    return this.seed(data, options);
  }

  async bulkInsert(label: string, records: Record<string, unknown>[]): Promise<BulkInsertResult> {
    const nodeConfig = this.schema ? (this.schema[label] ?? null) : null;
    const result: BulkInsertResult = {
      label,
      created: 0,
      failed: 0,
      errors: [],
    };

    // Process in batches
    for (let i = 0; i < records.length; i += this.batchSize) {
      const batch = records.slice(i, i + this.batchSize);
      await this.insertBatch(label, batch, nodeConfig, result);
    }

    return result;
  }

  private async insertBatch(
    label: string,
    batch: Record<string, unknown>[],
    _nodeConfig: AnyNodeConfig | null,
    result: BulkInsertResult,
  ): Promise<void> {
    const statements: string[] = [];
    const params: Record<string, unknown> = {};

    for (let i = 0; i < batch.length; i++) {
      const record = batch[i];
      if (!record) continue;
      const paramPrefix = `b${i}_`;

      const setClauses: string[] = [];
      for (const [key, value] of Object.entries(record)) {
        if (value === undefined) continue;
        const paramName = `${paramPrefix}${key}`;
        setClauses.push(`${key}: $${paramName}`);
        params[paramName] = value;
      }

      if (setClauses.length > 0) {
        const propsString = `{ ${setClauses.join(', ')} }`;
        statements.push(`CREATE (n${i}:${label} ${propsString})`);
      } else {
        statements.push(`CREATE (n${i}:${label})`);
      }
    }

    if (statements.length === 0) return;

    const cypher = statements.join('\n');

    try {
      await this.driver.runQuery(cypher, params);
      result.created += batch.length;
    } catch (_error) {
      // Fallback: insert one by one to identify failures
      for (let i = 0; i < batch.length; i++) {
        try {
          const singleCypher = statements[i] ?? '';
          const singleParams: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(batch[i] ?? {})) {
            if (value === undefined) continue;
            const paramName = `b${i}_${key}`;
            singleParams[paramName] = value;
          }
          await this.driver.runQuery(singleCypher, singleParams);
          result.created++;
        } catch (e) {
          result.failed++;
          result.errors.push({ data: batch[i] ?? {}, error: e as Error });
        }
      }
    }
  }

  async clearLabel(label: string): Promise<number> {
    const cypher = `MATCH (n:${label}) DETACH DELETE n`;
    const result = await this.driver.runQuery(cypher);
    return (result.summary.counters['nodesDeleted'] ?? 0) as number;
  }

  async clearAll(labels?: string[]): Promise<void> {
    const targetLabels = labels ?? (this.schema ? Object.keys(this.schema) : []);
    for (const label of [...targetLabels].reverse()) {
      await this.clearLabel(label);
    }
  }

  private resolveDependencies(data: SeedData, dependencies: string[]): string[] {
    const labels = Object.keys(data);
    const resolved: string[] = [];
    const remaining = new Set(labels);

    // Add dependencies first
    for (const dep of dependencies) {
      if (remaining.has(dep)) {
        resolved.push(dep);
        remaining.delete(dep);
      }
    }

    // Add remaining in schema order or alphabetical
    for (const label of labels) {
      if (remaining.has(label)) {
        resolved.push(label);
      }
    }

    return resolved;
  }

  getRegisteredFactories(): string[] {
    return [...this.factories.keys()];
  }
}

export function createSeedManager(config: SeedConfig): SeedManager {
  return new SeedManager(config);
}

// Built-in fixture factories
export const Fixtures = {
  uuid: (): string => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  },

  email: (name?: string): string => {
    const domains = ['example.com', 'test.com', 'demo.org'];
    const base =
      name?.toLowerCase().replace(/\s+/g, '.') || `user${Math.floor(Math.random() * 10000)}`;
    return `${base}@${domains[Math.floor(Math.random() * domains.length)]}`;
  },

  name: (): string => {
    const firstNames = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Frank', 'Grace', 'Henry'];
    const lastNames = ['Smith', 'Jones', 'Williams', 'Brown', 'Davis', 'Miller', 'Wilson'];
    return `${firstNames[Math.floor(Math.random() * firstNames.length)]} ${lastNames[Math.floor(Math.random() * lastNames.length)]}`;
  },

  date: (start?: Date, end?: Date): Date => {
    const startDate = start?.getTime() ?? Date.now() - 365 * 24 * 60 * 60 * 1000;
    const endDate = end?.getTime() ?? Date.now();
    return new Date(startDate + Math.random() * (endDate - startDate));
  },

  randomFromArray: <T>(arr: T[]): T => {
    if (arr.length === 0)
      raiseGraphError('Cannot pick from empty array', {
        code: 'invalid_argument',
        statusCode: 400,
      });
    return arr[Math.floor(Math.random() * arr.length)] as T;
  },

  sequence: (start = 1): (() => number) => {
    let counter = start;
    return () => counter++;
  },
};

// Common factory creators
export function createUserFactory(
  overrides: Partial<Record<string, unknown>> = {},
): FixtureFactory {
  const idSeq = Fixtures.sequence(1);
  return (customOverrides = {}, _index = 0) => ({
    id: `user_${idSeq()}`,
    name: Fixtures.name(),
    email: Fixtures.email(),
    createdAt: Fixtures.date(),
    ...overrides,
    ...customOverrides,
  });
}

export function createPostFactory(
  overrides: Partial<Record<string, unknown>> = {},
): FixtureFactory {
  const idSeq = Fixtures.sequence(1);
  const titles = [
    'Getting Started with Graph Databases',
    'Advanced Cypher Queries',
    'Data Modeling Best Practices',
    'Performance Optimization Tips',
    'Schema Design Patterns',
  ];
  let titleIndex = 0;
  return (customOverrides = {}, _index = 0) => ({
    id: `post_${idSeq()}`,
    title: titles[titleIndex++ % titles.length],
    content: 'Lorem ipsum dolor sit amet...',
    published: Math.random() > 0.5,
    createdAt: Fixtures.date(),
    ...overrides,
    ...customOverrides,
  });
}

export function createRelationFactory(
  _fromLabel: string,
  _toLabel: string,
  relationType: string,
  direction: 'IN' | 'OUT' = 'OUT',
): FixtureFactory {
  return (customOverrides = {}) => ({
    from: customOverrides['from'],
    to: customOverrides['to'],
    type: relationType,
    direction,
    createdAt: Fixtures.date(),
    ...customOverrides,
  });
}

// JSON/CSV seed file loaders
export async function loadSeedFromJson(filePath: string): Promise<SeedData> {
  const fs = await import('node:fs/promises');
  const content = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(content);
}

export async function loadSeedFromCsv(filePath: string): Promise<SeedData> {
  const fs = await import('node:fs/promises');
  const content = await fs.readFile(filePath, 'utf-8');
  const lines = content.trim().split('\n');
  if (lines.length < 2) return {};

  const headers = lines[0]?.split(',').map((h) => h.trim());
  const data: SeedData = {};

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i]?.split(',').map((v) => v.trim());
    const record: Record<string, unknown> = {};
    if (!headers || !values) continue;
    headers.forEach((header, idx) => {
      let value: unknown = values[idx];
      // Type inference
      if (value === 'true') value = true;
      else if (value === 'false') value = false;
      else if (!Number.isNaN(Number(value)) && value !== '') value = Number(value);
      record[header] = value;
    });

    // Assume first column is label or use a default
    const label = (record['label'] as string) || 'Node';
    delete record['label'];

    if (!data[label]) data[label] = [];
    data[label].push(record);
  }

  return data;
}

export async function writeSeedToJson(data: SeedData, filePath: string): Promise<void> {
  const fs = await import('node:fs/promises');
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}
