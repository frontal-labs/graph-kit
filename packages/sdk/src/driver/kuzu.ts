// @graph-om/sdk/src/driver/kuzu.ts
// Kuzu driver adapter - Kuzu is an embedded graph database
// Uses native Node.js bindings or HTTP API

import {
  classifyDriverError,
  connectionFailure,
  driverErrorBoundary,
  raiseGraphError,
} from '../errors';
import type {
  DriverAdapter,
  DriverCapabilities,
  DriverConfig,
  QueryRecord,
  QueryResult,
  TransactionContext,
} from './index';

// Minimal type definitions for kuzu (kuzu doesn't have official types)
// These are used internally and don't conflict with declaration files
interface KuzuConnection {
  query(cypher: string, params?: Record<string, unknown>): Promise<KuzuQueryResult>;
  close(): Promise<void>;
}

interface KuzuQueryResult {
  getColumnNames(): string[] | undefined;
  getNext(): boolean;
  getValue(index: number): unknown;
  hasNext(): boolean;
}

interface KuzuModule {
  Database: new (path: string) => { connect(): KuzuConnection };
  Connection: new (
    db: unknown,
  ) => {
    query(cypher: string, params?: Record<string, unknown>): Promise<KuzuQueryResult>;
    close(): Promise<void>;
  };
}

let kuzuModule: KuzuModule | undefined;

async function loadKuzu(): Promise<KuzuModule> {
  if (kuzuModule) return kuzuModule;
  try {
    // @ts-expect-error kuzu has no bundled type declarations
    const mod = (await import('kuzu')) as KuzuModule;
    kuzuModule = mod;
    return kuzuModule;
  } catch {
    raiseGraphError('Kuzu driver not installed. Run: pnpm add kuzu', {
      code: 'invalid_config',
      statusCode: 400,
    });
  }
}

export interface KuzuConfig extends DriverConfig {
  type: 'kuzu';
  databasePath: string;
  uri: string; // For network mode (required by base DriverConfig)
  username: string;
  password: string;
}

export class KuzuDriverAdapter implements DriverAdapter {
  private db: InstanceType<KuzuModule['Database']> | null = null;
  private conn: KuzuConnection | null = null;
  private config: KuzuConfig;
  private capabilities: DriverCapabilities;

  constructor(config: KuzuConfig) {
    this.config = config;
    this.capabilities = {
      transactions: true, // Kuzu supports ACID transactions
      readReplicas: false,
      boltProtocol: false,
      httpProtocol: true, // Can use HTTP API
      vectorSearch: true, // Kuzu has HNSW vector index
      fullTextSearch: false,
      geospatial: false,
      procedures: [],
    };
  }

  async connect(): Promise<void> {
    const kuzu = await loadKuzu();

    if (this.config.uri) {
      // Network mode - would need HTTP client
      raiseGraphError(
        'Kuzu network mode not yet implemented. Use embedded mode with databasePath.',
        { code: 'unsupported_option', statusCode: 400 },
      );
    }

    try {
      this.db = new kuzu.Database(this.config.databasePath);
      this.conn = this.db.connect();
    } catch (error) {
      this.db = null;
      this.conn = null;
      throw connectionFailure(
        error,
        'kuzu',
        { databasePath: this.config.databasePath },
        'Check that the database path is writable and not locked by another process.',
      );
    }
  }

  async disconnect(): Promise<void> {
    if (this.conn) {
      await this.conn.close();
      this.conn = null;
    }
    this.db = null;
  }

  async runQuery(cypher: string, params?: Record<string, unknown>): Promise<QueryResult> {
    if (!this.conn) {
      raiseGraphError('Kuzu not connected. Call connect() first.', {
        code: 'driver_not_connected',
        statusCode: 500,
        attributes: { 'db.system': 'kuzu' },
      });
    }

    // Kuzu uses parameterized queries with $param syntax
    const _paramKeys = params ? Object.keys(params) : [];
    const finalCypher = cypher;

    // Convert Neo4j $param syntax to Kuzu $param syntax (they're the same)
    // No conversion needed for basic parameters

    try {
      const result = await this.conn.query(finalCypher, params);
      return this.mapResult(result);
    } catch (error) {
      throw classifyDriverError(error, 'kuzu');
    }
  }

  async runInTransaction<T>(work: (txc: TransactionContext) => Promise<T>): Promise<T> {
    if (!this.conn) {
      raiseGraphError('Kuzu not connected. Call connect() first.', {
        code: 'driver_not_connected',
        statusCode: 500,
        attributes: { 'db.system': 'kuzu' },
      });
    }

    // Each query runs immediately, so reads inside the transaction see their own writes.
    // BEGIN/COMMIT/ROLLBACK provide the atomicity.
    const conn = this.conn;
    const txc: TransactionContext = {
      run: async (query: string, params?: Record<string, unknown>) => {
        try {
          return this.mapResult(await conn.query(query, params));
        } catch (error) {
          throw classifyDriverError(error, 'kuzu');
        }
      },
    };

    const boundary = driverErrorBoundary('kuzu');
    try {
      await conn.query('BEGIN TRANSACTION');
      const result = await boundary.user(() => work(txc));
      await conn.query('COMMIT');
      return result;
    } catch (error) {
      // Best effort: a failing rollback must not hide the error that caused it
      await conn.query('ROLLBACK').catch(() => {});
      throw boundary.classify(error);
    }
  }

  async runInReadTransaction<T>(work: (txc: TransactionContext) => Promise<T>): Promise<T> {
    // Kuzu doesn't distinguish read/write transactions
    return this.runInTransaction(work);
  }

  async verifyConnectivity(): Promise<boolean> {
    try {
      if (!this.conn) return false;
      await this.conn.query('RETURN 1');
      return true;
    } catch {
      return false;
    }
  }

  async getServerInfo(): Promise<{
    address: string;
    version: string;
    protocol: string;
  }> {
    return {
      address: this.config.databasePath,
      version: 'unknown',
      protocol: 'embedded',
    };
  }

  getCapabilities(): DriverCapabilities {
    return this.capabilities;
  }

  private mapResult(result: KuzuQueryResult): QueryResult {
    const keys = result.getColumnNames() ?? [];
    const records: QueryRecord[] = [];

    while (result.hasNext()) {
      result.getNext();
      const record: QueryRecord = {
        keys,
        get: (key: string) => {
          const index = keys.indexOf(key);
          return index >= 0 ? result.getValue(index) : null;
        },
        toObject: () => {
          const obj: Record<string, unknown> = {};
          for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            if (key === undefined) continue;
            obj[key] = result.getValue(i);
          }
          return obj;
        },
      };
      records.push(record);
    }

    return {
      records,
      summary: {
        query: { text: '', parameters: {} },
        counters: {},
        notifications: [],
        resultAvailableAfter: 0,
        resultConsumedAfter: 0,
        database: { name: 'kuzu' },
      },
      keys,
    };
  }
}
