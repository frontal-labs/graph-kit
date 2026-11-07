// @graph-om/kuzu/src/index.ts
// Kuzu driver adapter - Kuzu is an embedded graph database
// Uses native Node.js bindings or HTTP API

import type {
  DriverAdapter,
  DriverCapabilities,
  DriverConfig,
  QueryRecord,
  QueryResult,
  TransactionContext,
} from '@graph-om/sdk';

// Type definitions for kuzu module (using any to avoid declaration file issues)
interface KuzuConnection {
  query(cypher: string, params?: Record<string, unknown>): Promise<any>;
  close(): Promise<void>;
}

interface KuzuQueryResult {
  getColumnNames(): string[] | undefined;
  getNext(): boolean;
  getValue(index: number): unknown;
  hasNext(): boolean;
}

interface KuzuDatabase {
  connect(): KuzuConnection;
}

interface KuzuConnectionClass {
  new (db: unknown): KuzuConnection;
}

interface KuzuModule {
  Database: new (path: string) => { connect(): KuzuConnection };
  Connection: new (
    db: unknown,
  ) => {
    query(cypher: string, params?: Record<string, unknown>): Promise<any>;
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
  private inTransaction = false;
  private transactionQueries: Array<{ cypher: string; params?: Record<string, unknown> }> = [];

  constructor(config: KuzuConfig) {
    this.config = config;
    this.capabilities = {
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
    if (!this.conn) throw new Error('Not connected to Kuzu');
    const result = await this.conn.query(cypher, params);
    return this.mapResult(result);
  }

  async runInTransaction<T>(work: (txc: TransactionContext) => Promise<T>): Promise<T> {
    if (this.inTransaction) {
      throw new Error('Nested transactions not supported');
    }
    this.inTransaction = true;
    this.transactionQueries = [];
    try {
      const result = await work(this.createTransactionContext());
      await this.commitTransaction();
      return result;
    } catch (error) {
      await this.rollbackTransaction();
      throw error;
    } finally {
      this.inTransaction = false;
    }
  }

  async runInReadTransaction<T>(work: (txc: TransactionContext) => Promise<T>): Promise<T> {
    return this.runInTransaction(work);
  }

  async verifyConnectivity(): Promise<boolean> {
    try {
      if (!this.conn) return false;
      await this.conn.query('MATCH (n) RETURN count(n) LIMIT 1');
      return true;
    } catch {
      return false;
    }
  }

  async getServerInfo(): Promise<{ address: string; version: string; protocol: string }> {
    return {
      address: this.config.databasePath,
      version: 'unknown',
      protocol: 'embedded',
    };
  }

  getCapabilities(): DriverCapabilities {
    return this.capabilities;
  }

  private createTransactionContext(): TransactionContext {
    return {
      run: async (query: string, params?: Record<string, unknown>): Promise<QueryResult> => {
        this.transactionQueries.push({ cypher: query, params });
        // Execute immediately for simplicity
        if (!this.conn) throw new Error('Not connected to Kuzu');
        const result = await this.conn.query(query, params);
        return this.mapResult(result);
      },
    };
  }

  private async commitTransaction(): Promise<void> {
    // Kuzu auto-commits each query, so no explicit commit needed
    this.transactionQueries = [];
  }

  private async rollbackTransaction(): Promise<void> {
    // Kuzu doesn't support rollback in embedded mode
    this.transactionQueries = [];
  }

  private mapResult(result: any): QueryResult {
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
            obj[keys[i]] = result.getValue(i);
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

export function createKuzuDriver(config: KuzuConfig): KuzuDriverAdapter {
  return new KuzuDriverAdapter(config);
}
