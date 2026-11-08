// @graph-om/sdk/src/driver/kuzu.ts
// Kuzu driver adapter - Kuzu is an embedded graph database, used through the `kuzu` npm package

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

// The part of the `kuzu` package API this adapter uses. The package ships no type declarations.
interface KuzuResult {
  getColumnNames(): Promise<string[]>;
  getAll(): Promise<Array<Record<string, unknown>>>;
}

type KuzuPreparedStatement = unknown;

interface KuzuConnection {
  query(cypher: string): Promise<KuzuResult>;
  prepare(cypher: string): Promise<KuzuPreparedStatement>;
  execute(prepared: KuzuPreparedStatement, params: Record<string, unknown>): Promise<KuzuResult>;
  close(): Promise<void>;
}

interface KuzuDatabase {
  init(): Promise<void>;
  close(): Promise<void>;
}

interface KuzuModule {
  Database: new (path: string) => KuzuDatabase;
  Connection: new (db: KuzuDatabase) => KuzuConnection;
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
  private db: KuzuDatabase | null = null;
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
      const db = new kuzu.Database(this.config.databasePath);
      await db.init();
      this.db = db;
      this.conn = new kuzu.Connection(db);
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
    if (this.db) {
      await this.db.close();
      this.db = null;
    }
  }

  async runQuery(cypher: string, params?: Record<string, unknown>): Promise<QueryResult> {
    const conn = this.conn;
    if (!conn) {
      raiseGraphError('Kuzu not connected. Call connect() first.', {
        code: 'driver_not_connected',
        statusCode: 500,
        attributes: { 'db.system': 'kuzu' },
      });
    }
    try {
      return await this.execute(conn, cypher, params);
    } catch (error) {
      throw classifyDriverError(error, 'kuzu');
    }
  }

  async runInTransaction<T>(work: (txc: TransactionContext) => Promise<T>): Promise<T> {
    const conn = this.conn;
    if (!conn) {
      raiseGraphError('Kuzu not connected. Call connect() first.', {
        code: 'driver_not_connected',
        statusCode: 500,
        attributes: { 'db.system': 'kuzu' },
      });
    }

    // Each query runs immediately, so reads inside the transaction see their own writes.
    // BEGIN/COMMIT/ROLLBACK provide the atomicity.
    const txc: TransactionContext = {
      run: async (query: string, params?: Record<string, unknown>) => {
        try {
          return await this.execute(conn, query, params);
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

  /** Parameters need a prepared statement in Kuzu; a plain query takes none. */
  private async execute(
    conn: KuzuConnection,
    cypher: string,
    params?: Record<string, unknown>,
  ): Promise<QueryResult> {
    const result =
      params && Object.keys(params).length > 0
        ? await conn.execute(await conn.prepare(cypher), params)
        : await conn.query(cypher);
    return this.mapResult(await result.getColumnNames(), await result.getAll());
  }

  private mapResult(keys: string[], rows: Array<Record<string, unknown>>): QueryResult {
    const records: QueryRecord[] = rows.map((row) => ({
      keys,
      get: (key: string) => row[key] ?? null,
      toObject: () => ({ ...row }),
    }));

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
