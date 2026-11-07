// @graph-om/falkordb/src/index.ts
// FalkorDB driver adapter - uses Redis Stack / RedisGraph protocol

import type {
  DriverAdapter,
  DriverCapabilities,
  FalkorDBDriverConfig,
  QueryRecord,
  QueryResult,
  TransactionContext,
} from '@graph-om/sdk';
import { createClient, type RedisClientType } from 'redis';

export class FalkorDBDriverAdapter implements DriverAdapter {
  private client: RedisClientType;
  private config: FalkorDBDriverConfig;
  private connected: boolean = false;
  private capabilities: DriverCapabilities = {
    transactions: false, // No native multi-query transactions (MULTI/EXEC serializes all graphs)
    readReplicas: false,
    boltProtocol: false,
    httpProtocol: false,
    vectorSearch: true, // euclidean / cosine vector indexes
    fullTextSearch: true, // db.idx.fulltext.* procedures
    geospatial: true, // point() type
    procedures: ['db.idx.fulltext'],
  };

  constructor(config: FalkorDBDriverConfig) {
    this.config = config;
    this.client = createClient({
      socket: {
        host: config.host ?? 'localhost',
        port: config.port ?? 6379,
      },
      password: config.password,
      database: Number(config.database ?? 0),
    });

    this.client.on('error', (err) => {
      console.error('FalkorDB Client Error:', err);
    });
  }

  async connect(): Promise<void> {
    if (!this.connected) {
      await this.client.connect();
      this.connected = true;

      // Test connection
      await this.client.ping();
    }
  }

  async disconnect(): Promise<void> {
    if (this.connected) {
      await this.client.quit();
      this.connected = false;
    }
  }

  async runQuery(cypher: string, params?: Record<string, unknown>): Promise<QueryResult> {
    if (!this.connected) await this.connect();

    const graphName = this.config.graphName ?? 'default';
    const _query = `GRAPH.QUERY ${graphName} "${cypher}" ${this.formatParams(params)}`;

    try {
      const result = await this.client.sendCommand([
        'GRAPH.QUERY',
        graphName,
        cypher,
        ...this.flattenParams(params),
      ]);
      return this.mapResult(result);
    } catch (error) {
      // Try alternative command format for newer Redis Stack
      try {
        const result = await this.client.sendCommand([
          'GRAPH.RO_QUERY',
          graphName,
          cypher,
          ...this.flattenParams(params),
        ]);
        return this.mapResult(result);
      } catch {
        throw error;
      }
    }
  }

  async runInTransaction<T>(work: (txc: TransactionContext) => Promise<T>): Promise<T> {
    // FalkorDB doesn't support transactions in the same way
    // We'll execute in a single query context
    const txc = this.createTransactionContext();
    return work(txc);
  }

  async runInReadTransaction<T>(work: (txc: TransactionContext) => Promise<T>): Promise<T> {
    // FalkorDB doesn't support read transactions separately
    return this.runInTransaction(work);
  }

  async verifyConnectivity(): Promise<boolean> {
    try {
      if (!this.connected) await this.connect();
      await this.client.ping();
      return true;
    } catch {
      return false;
    }
  }

  async getServerInfo(): Promise<{ address: string; version: string; protocol: string }> {
    if (!this.connected) await this.connect();

    const info = await this.client.info('server');
    const versionMatch = info.match(/redis_version:([^\r\n]+)/);
    const version = versionMatch?.[1] ?? 'unknown';

    return {
      address: `${this.config.host}:${this.config.port}`,
      version,
      protocol: 'redis',
    };
  }

  private createTransactionContext(): TransactionContext {
    return {
      run: async (query: string, params?: Record<string, unknown>): Promise<QueryResult> => {
        return this.runQuery(query, params);
      },
    };
  }

  private formatParams(params?: Record<string, unknown>): string {
    if (!params || Object.keys(params).length === 0) return '';
    return JSON.stringify(params);
  }

  private flattenParams(params?: Record<string, unknown>): string[] {
    if (!params) return [];
    const flattened: string[] = [];
    for (const [key, value] of Object.entries(params)) {
      flattened.push(key, JSON.stringify(value));
    }
    return flattened;
  }

  private mapResult(result: any): QueryResult {
    // FalkorDB returns results in a specific format
    // { header: string[], results: any[][] }
    const header = result.header || [];
    const results = result.results || [];

    return {
      records: results.map((row: any[]) => this.mapRecord(header, row)),
      summary: {
        query: { text: '', parameters: {} },
        counters: {},
        notifications: [],
        resultAvailableAfter: 0,
        resultConsumedAfter: 0,
        database: { name: this.config.graphName ?? 'default' },
      },
      keys: header,
    };
  }

  getCapabilities(): DriverCapabilities {
    return this.capabilities;
  }

  private mapRecord(header: string[], row: any[]): QueryRecord {
    const obj: Record<string, unknown> = {};
    header.forEach((key, index) => {
      obj[key] = this.parseValue(row[index]);
    });
    return {
      keys: header,
      get: (key: string) => obj[key],
      toObject: () => ({ ...obj }),
    };
  }

  private parseValue(value: any): unknown {
    if (value === null || value === undefined) return value;
    if (typeof value === 'string') {
      // Try to parse JSON
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }
    if (Array.isArray(value)) {
      return value.map((v) => this.parseValue(v));
    }
    if (typeof value === 'object') {
      const parsed: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        parsed[k] = this.parseValue(v);
      }
      return parsed;
    }
    return value;
  }
}

export function createFalkorDBDriver(config: FalkorDBDriverConfig): FalkorDBDriverAdapter {
  return new FalkorDBDriverAdapter(config);
}
