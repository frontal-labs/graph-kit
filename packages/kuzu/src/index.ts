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
import { classifyDriverError, raiseGraphError } from '@graph-om/sdk/errors';

// Type definitions for kuzu module (using any to avoid declaration file issues)
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
      retry: { retryable: false },
    });
  }
}

function notConnected(): never {
  raiseGraphError('Not connected to Kuzu', {
    code: 'driver_not_connected',
    statusCode: 500,
    retry: { retryable: false },
    attributes: { 'db.system': 'kuzu' },
  });
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
      raiseGraphError(
        'Kuzu network mode not yet implemented. Use embedded mode with databasePath.',
        { code: 'unsupported_option', statusCode: 400, retry: { retryable: false } },
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
    if (!this.conn) notConnected();
    try {
      const result = await this.conn.query(cypher, params);
      return this.mapResult(result);
    } catch (error) {
      throw classifyDriverError(error, 'kuzu');
    }
  }

  async runInTransaction<T>(work: (txc: TransactionContext) => Promise<T>): Promise<T> {
    if (this.inTransaction) {
      raiseGraphError('Nested transactions not supported', {
        code: 'unsupported_option',
        statusCode: 400,
        retry: { retryable: false },
        attributes: { 'db.system': 'kuzu' },
      });
    }
    this.inTransaction = true;
    this.transactionQueries = [];
    let workFailed = false;
    try {
      let result: T;
      try {
        result = await work(this.createTransactionContext());
      } catch (error) {
        workFailed = true;
        throw error;
      }
      await this.commitTransaction();
      return result;
    } catch (error) {
      await this.rollbackTransaction();
      throw workFailed ? error : classifyDriverError(error, 'kuzu');
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
        if (!this.conn) notConnected();
        try {
          const result = await this.conn.query(query, params);
          return this.mapResult(result);
        } catch (error) {
          throw classifyDriverError(error, 'kuzu');
        }
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
          for (const [i, key] of keys.entries()) {
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

export function createKuzuDriver(config: KuzuConfig): KuzuDriverAdapter {
  return new KuzuDriverAdapter(config);
}
