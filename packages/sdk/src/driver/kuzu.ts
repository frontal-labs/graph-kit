// @graph-om/sdk/src/driver/kuzu.ts
// Kuzu driver adapter - Kuzu is an embedded graph database
// Uses native Node.js bindings or HTTP API

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
    throw new Error('Kuzu driver not installed. Run: pnpm add kuzu');
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
  private transactionQueries: Array<{ cypher: string; params?: Record<string, unknown> }> = [];

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
      throw new Error(
        'Kuzu network mode not yet implemented. Use embedded mode with databasePath.',
      );
    }

    this.db = new kuzu.Database(this.config.databasePath);
    this.conn = this.db.connect();
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
      throw new Error('Kuzu not connected. Call connect() first.');
    }

    // Kuzu uses parameterized queries with $param syntax
    const _paramKeys = params ? Object.keys(params) : [];
    const finalCypher = cypher;

    // Convert Neo4j $param syntax to Kuzu $param syntax (they're the same)
    // No conversion needed for basic parameters

    const result = await this.conn.query(finalCypher, params);
    return this.mapResult(result);
  }

  async runInTransaction<T>(work: (txc: TransactionContext) => Promise<T>): Promise<T> {
    if (!this.conn) {
      throw new Error('Kuzu not connected. Call connect() first.');
    }

    this.transactionQueries = [];

    const txc: TransactionContext = {
      run: async (query: string, params?: Record<string, unknown>) => {
        this.transactionQueries.push({ cypher: query, params });
        // Return empty result for now, actual execution happens on commit
        return {
          records: [],
          summary: {
            query: { text: query, parameters: params ?? {} },
            counters: {},
            notifications: [],
            resultAvailableAfter: 0,
            resultConsumedAfter: 0,
            database: { name: 'kuzu' },
          },
          keys: [],
        };
      },
    };

    try {
      // Start transaction
      await this.conn.query('BEGIN TRANSACTION');

      const result = await work(txc);

      // Execute all queued queries
      for (const { cypher, params } of this.transactionQueries) {
        await this.conn?.query(cypher, params);
      }

      await this.conn.query('COMMIT');
      return result;
    } catch (error) {
      await this.conn.query('ROLLBACK');
      throw error;
    } finally {
      this.transactionQueries = [];
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
