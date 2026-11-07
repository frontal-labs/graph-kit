// @graph-om/sdk/src/driver/falkordb.ts
// FalkorDB driver adapter - FalkorDB is Redis-based graph database
// Uses Redis Stack / RedisGraph protocol (Redis modules)

import type {
  DriverAdapter,
  DriverCapabilities,
  DriverConfig,
  QueryRecord,
  QueryResult,
  TransactionContext,
} from './index';

export interface FalkorDBConfig extends DriverConfig {
  type: 'falkordb';
  uri: string;
  username: string;
  password: string;
  database?: string;
  maxRetriesPerRequest?: number;
  enableReadyCheck?: boolean;
  lazyConnect?: boolean;
}

interface RedisClient {
  connect(): Promise<unknown>;
  disconnect(): Promise<unknown>;
  sendCommand(command: string[], args: unknown[]): Promise<unknown>;
  executeIsolated(command: string[]): Promise<unknown>;
}

type RedisOptions = Record<string, unknown>;

interface IoRedisLike {
  connect(): Promise<unknown>;
  quit(): Promise<unknown>;
  call(command: string, ...args: unknown[]): Promise<unknown>;
}

interface RedisJsClient {
  connect(): Promise<unknown>;
  quit(): Promise<unknown>;
  sendCommand(command: string[], args: unknown[]): Promise<unknown>;
  executeIsolated(command: string[]): Promise<unknown>;
}

let redisModule: { createClient: (options: RedisOptions) => RedisClient } | undefined;

async function loadRedis(): Promise<{ createClient: (options: RedisOptions) => RedisClient }> {
  if (redisModule) return redisModule;
  try {
    // Try to load ioredis or @redis/client
    try {
      const ioredis = await import('ioredis');
      const Redis = ioredis.default as unknown as new (options: RedisOptions) => IoRedisLike;
      redisModule = {
        createClient: (options: RedisOptions) => {
          const client = new Redis(options);
          return {
            connect: () => client.connect(),
            disconnect: () => client.quit(),
            sendCommand: (command: string[], args: unknown[]) =>
              client.call(command[0] ?? '', ...args),
            executeIsolated: (command: string[]) =>
              client.call(command[0] ?? '', ...command.slice(1)),
          };
        },
      };
    } catch {
      // Try @redis/client
      const redis = await import('@redis/client');
      redisModule = {
        createClient: (options: RedisOptions) => {
          const client = redis.createClient(
            options as Parameters<typeof redis.createClient>[0],
          ) as unknown as RedisJsClient;
          return {
            connect: () => client.connect(),
            disconnect: () => client.quit(),
            sendCommand: (command: string[], args: unknown[]) => client.sendCommand(command, args),
            executeIsolated: (command: string[]) => client.executeIsolated(command),
          };
        },
      };
    }
    if (!redisModule) {
      throw new Error('Redis client not installed. Run: pnpm add ioredis or /client');
    }
    return redisModule;
  } catch {
    throw new Error('Redis client not installed. Run: pnpm add ioredis or @redis/client');
  }
}

function parseFalkorDBResult(result: unknown): { keys: string[]; rows: unknown[][] } {
  // FalkorDB returns results in Redis array format
  // [header, [row1], [row2], ...] or similar
  if (!Array.isArray(result)) {
    return { keys: [], rows: [] };
  }

  const arr = result as unknown[];
  if (arr.length === 0) return { keys: [], rows: [] };

  // First element is usually the header/keys
  const keys = Array.isArray(arr[0]) ? arr[0].map(String) : [];
  const rows = arr.slice(1).map((r) => (Array.isArray(r) ? r : [r]));

  return { keys, rows };
}

export class FalkorDBDriverAdapter implements DriverAdapter {
  private client: RedisClient | null = null;
  private config: FalkorDBConfig;
  private capabilities: DriverCapabilities;
  private selectedGraph: string = '';

  constructor(config: FalkorDBConfig) {
    this.config = config;
    this.capabilities = {
      transactions: true, // FalkorDB supports transactions via MULTI/EXEC
      readReplicas: true, // Redis replication
      boltProtocol: false,
      httpProtocol: false, // Uses Redis protocol
      vectorSearch: true, // Redis Stack has vector search
      fullTextSearch: true, // Redis Stack has RediSearch
      geospatial: true, // Redis has geospatial indexes
      procedures: ['GRAPH', 'FT', 'VECTOR'],
    };
  }

  async connect(): Promise<void> {
    const { createClient } = await loadRedis();

    const url = new URL(this.config.uri);
    const client = createClient({
      socket: {
        host: url.hostname,
        port: parseInt(url.port || '6379', 10),
        tls: url.protocol === 'rediss:',
      },
      username: this.config.username,
      password: this.config.password,
      database: this.config.database ? parseInt(this.config.database, 10) : undefined,
      maxRetriesPerRequest: this.config.maxRetriesPerRequest ?? 3,
      enableReadyCheck: this.config.enableReadyCheck ?? true,
      lazyConnect: this.config.lazyConnect ?? true,
    });

    this.client = client;
    await client.connect();

    // Select the graph (database)
    this.selectedGraph = this.config.database || 'default';
    await this.selectGraph(this.selectedGraph);
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.disconnect();
      this.client = null;
    }
  }

  private async selectGraph(graphName: string): Promise<void> {
    if (!this.client) throw new Error('Not connected');
    // GRAPH.SELECT is not a standard command, graphs are selected via GRAPH.QUERY
    // We just store the name for query prefixing
    this.selectedGraph = graphName;
  }

  async runQuery(cypher: string, params?: Record<string, unknown>): Promise<QueryResult> {
    if (!this.client) {
      throw new Error('FalkorDB not connected. Call connect() first.');
    }

    // Convert params to FalkorDB format
    const paramArgs = params ? Object.entries(params).flatMap(([k, v]) => [k, String(v)]) : [];

    const command: string[] = ['GRAPH.QUERY', this.selectedGraph, cypher, ...paramArgs];
    const result = await this.client.sendCommand(command, []);

    return this.mapResult(result, cypher, params);
  }

  async runInTransaction<T>(work: (txc: TransactionContext) => Promise<T>): Promise<T> {
    if (!this.client) {
      throw new Error('FalkorDB not connected. Call connect() first.');
    }

    const queries: Array<{ cypher: string; params?: Record<string, unknown> }> = [];

    const txc: TransactionContext = {
      run: async (query: string, params?: Record<string, unknown>) => {
        queries.push({ cypher: query, params });
        return {
          records: [],
          summary: {
            query: { text: query, parameters: params ?? {} },
            counters: {},
            notifications: [],
            resultAvailableAfter: 0,
            resultConsumedAfter: 0,
            database: { name: this.selectedGraph },
          },
          keys: [],
        };
      },
    };

    try {
      // Start transaction with MULTI
      await this.client.sendCommand(['MULTI'], []);

      const result = await work(txc);

      // Execute all queries
      for (const { cypher, params } of queries) {
        const paramArgs = params ? Object.entries(params).flatMap(([k, v]) => [k, String(v)]) : [];
        const queryCommand: string[] = ['GRAPH.QUERY', this.selectedGraph, cypher, ...paramArgs];
        await this.client.sendCommand(queryCommand, []);
      }

      // Execute transaction
      await this.client.sendCommand(['EXEC'], []);

      return result;
    } catch (error) {
      // Discard transaction
      await this.client.sendCommand(['DISCARD'], []).catch(() => {});
      throw error;
    }
  }

  async runInReadTransaction<T>(work: (txc: TransactionContext) => Promise<T>): Promise<T> {
    // FalkorDB doesn't have separate read transactions
    return this.runInTransaction(work);
  }

  async verifyConnectivity(): Promise<boolean> {
    try {
      if (!this.client) return false;
      await this.client.sendCommand(['PING'], []);
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
    if (!this.client) {
      return { address: this.config.uri, version: 'unknown', protocol: 'redis' };
    }
    try {
      const info = await this.client.sendCommand(['INFO', 'SERVER'], []);
      const versionMatch = typeof info === 'string' ? info.match(/redis_version:([^\r\n]+)/) : null;
      return {
        address: this.config.uri,
        version: versionMatch?.[1]?.trim() || 'unknown',
        protocol: 'redis',
      };
    } catch {
      return { address: this.config.uri, version: 'unknown', protocol: 'redis' };
    }
  }

  getCapabilities(): DriverCapabilities {
    return this.capabilities;
  }

  private mapResult(
    result: unknown,
    cypher: string,
    params?: Record<string, unknown>,
  ): QueryResult {
    const { keys, rows } = parseFalkorDBResult(result);

    const records: QueryRecord[] = rows.map((row) => ({
      keys,
      get: (key: string) => {
        const index = keys.indexOf(key);
        return index >= 0 ? row[index] : null;
      },
      toObject: () => {
        const obj: Record<string, unknown> = {};
        keys.forEach((key, i) => {
          obj[key] = row[i];
        });
        return obj;
      },
    }));

    return {
      records,
      summary: {
        query: { text: cypher, parameters: params ?? {} },
        counters: {},
        notifications: [],
        resultAvailableAfter: 0,
        resultConsumedAfter: 0,
        database: { name: this.selectedGraph },
      },
      keys,
    };
  }
}

export function createFalkorDBDriver(config: FalkorDBConfig): FalkorDBDriverAdapter {
  return new FalkorDBDriverAdapter(config);
}
