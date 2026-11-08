// @graph-om/sdk/src/driver/falkordb.ts
// FalkorDB driver adapter - FalkorDB is Redis-based graph database
// Uses Redis Stack / RedisGraph protocol (Redis modules)

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
          // ioredis takes host, port and tls at the top level; the shared options nest them under socket
          const o = options as {
            socket?: { host?: string; port?: number; tls?: boolean };
            username?: string;
            password?: string;
            database?: number;
            maxRetriesPerRequest?: number;
            enableReadyCheck?: boolean;
            lazyConnect?: boolean;
          };
          const client = new Redis({
            host: o.socket?.host,
            port: o.socket?.port,
            tls: o.socket?.tls ? {} : undefined,
            username: o.username,
            password: o.password,
            db: o.database,
            maxRetriesPerRequest: o.maxRetriesPerRequest,
            enableReadyCheck: o.enableReadyCheck,
            lazyConnect: o.lazyConnect,
          });
          return {
            connect: () => client.connect(),
            disconnect: () => client.quit(),
            sendCommand: (command: string[], args: unknown[]) =>
              client.call(command[0] ?? '', ...command.slice(1), ...args),
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
      raiseGraphError('Redis client not installed. Run: pnpm add ioredis or /client', {
        code: 'invalid_config',
        statusCode: 400,
      });
    }
    return redisModule;
  } catch {
    raiseGraphError('Redis client not installed. Run: pnpm add ioredis or @redis/client', {
      code: 'invalid_config',
      statusCode: 400,
    });
  }
}

// Value type codes from FalkorDB's resultset formatter (see the FalkorDB source,
// resultset_formatter.h). Each cell in a result row is a [type, value] pair.
const VALUE_TYPE = {
  NULL: 1,
  STRING: 2,
  INTEGER: 3,
  BOOLEAN: 4,
  DOUBLE: 5,
  ARRAY: 6,
  EDGE: 7,
  NODE: 8,
  MAP: 10,
  POINT: 11,
  VECTORF32: 12,
} as const;

/**
 * Decode one typed cell. Nodes and edges come back as ids and property lists: resolving
 * label, relationship and property names needs FalkorDB's metadata calls, which this
 * adapter does not make. Temporal and path values are returned as the raw cell value.
 */
function decodeCell(cell: unknown): unknown {
  if (!Array.isArray(cell)) return cell;
  const [rawType, value] = cell as [unknown, unknown];
  switch (Number(rawType)) {
    case VALUE_TYPE.NULL:
      return null;
    case VALUE_TYPE.STRING:
      return value;
    case VALUE_TYPE.INTEGER:
      // Integers arrive as digit strings when read exactly; Number keeps values up to 2^53
      return typeof value === 'string' ? Number(value) : value;
    case VALUE_TYPE.BOOLEAN:
      return value === true || value === 'true';
    case VALUE_TYPE.DOUBLE:
      return typeof value === 'number' ? value : parseFloat(String(value));
    case VALUE_TYPE.ARRAY:
      return (value as unknown[]).map(decodeCell);
    case VALUE_TYPE.MAP: {
      // Flat sequence: key, typed value, key, typed value, ...
      const items = value as unknown[];
      const map: Record<string, unknown> = {};
      for (let i = 0; i + 1 < items.length; i += 2) {
        map[String(items[i])] = decodeCell(items[i + 1]);
      }
      return map;
    }
    case VALUE_TYPE.POINT: {
      const [latitude, longitude] = value as [unknown, unknown];
      return { latitude: parseFloat(String(latitude)), longitude: parseFloat(String(longitude)) };
    }
    case VALUE_TYPE.VECTORF32:
      return (value as unknown[]).map((x) => Number(x));
    case VALUE_TYPE.NODE: {
      const [id, labelIds, properties] = value as [unknown, unknown[], unknown[]];
      return {
        id: Number(id),
        labelIds: labelIds.map(Number),
        properties: decodeProperties(properties),
      };
    }
    case VALUE_TYPE.EDGE: {
      const [id, relationshipTypeId, sourceId, destinationId, properties] = value as [
        unknown,
        unknown,
        unknown,
        unknown,
        unknown[],
      ];
      return {
        id: Number(id),
        relationshipTypeId: Number(relationshipTypeId),
        sourceId: Number(sourceId),
        destinationId: Number(destinationId),
        properties: decodeProperties(properties),
      };
    }
    default:
      return value;
  }
}

/** Properties arrive as [keyId, type, value] triples. */
function decodeProperties(triples: unknown[]): Array<{ keyId: number; value: unknown }> {
  return triples.map((triple) => {
    const [keyId, type, value] = triple as [unknown, unknown, unknown];
    return { keyId: Number(keyId), value: decodeCell([type, value]) };
  });
}

/** One parameter value as a Cypher literal, the way FalkorDB's CYPHER header expects it. */
function cypherLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return `"${value.replace(/["\\]/g, '\\$&')}"`;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`Unsupported parameter value ${value}`);
    return value.toString();
  }
  if (typeof value === 'bigint' || typeof value === 'boolean') return value.toString();
  if (Array.isArray(value)) return `[${value.map(cypherLiteral).join(',')}]`;
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const entries = Object.entries(value as Record<string, unknown>).map(
      ([key, item]) => `\`${key}\`: ${cypherLiteral(item)}`,
    );
    return `{${entries.join(', ')}}`;
  }
  throw new TypeError(`Unsupported parameter type ${typeof value}`);
}

/**
 * FalkorDB takes parameters in a `CYPHER name=value ...` header in front of the query,
 * not as extra command arguments.
 */
function withParams(cypher: string, params?: Record<string, unknown>): string {
  const entries = params ? Object.entries(params) : [];
  if (entries.length === 0) return cypher;
  const header = entries.map(([key, value]) => `\`${key}\`=${cypherLiteral(value)}`).join(' ');
  return `CYPHER ${header} ${cypher}`;
}

/**
 * Parse a GRAPH.QUERY reply: [headers, data, statistics]. Headers are [type, name] pairs.
 * Data is absent for writes without RETURN, in which case there are no rows.
 */
function parseFalkorDBResult(reply: unknown): { keys: string[]; rows: unknown[][] } {
  if (!Array.isArray(reply)) return { keys: [], rows: [] };
  const [headers, data] = reply as [unknown, unknown];
  if (!Array.isArray(data)) return { keys: [], rows: [] };

  const keys = Array.isArray(headers)
    ? headers.map((header) => (Array.isArray(header) ? String(header[1]) : String(header)))
    : [];
  const rows = data.map((row) => (Array.isArray(row) ? row.map(decodeCell) : [decodeCell(row)]));
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
    try {
      await client.connect();
    } catch (error) {
      this.client = null;
      throw connectionFailure(
        error,
        'falkordb',
        { uri: this.config.uri },
        'Check the FalkorDB URI, credentials, and that the server is reachable.',
      );
    }

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
    if (!this.client) {
      raiseGraphError('Not connected', {
        code: 'driver_not_connected',
        statusCode: 500,
        attributes: { 'db.system': 'falkordb' },
      });
    }
    // GRAPH.SELECT is not a standard command, graphs are selected via GRAPH.QUERY
    // We just store the name for query prefixing
    this.selectedGraph = graphName;
  }

  async runQuery(cypher: string, params?: Record<string, unknown>): Promise<QueryResult> {
    if (!this.client) {
      raiseGraphError('FalkorDB not connected. Call connect() first.', {
        code: 'driver_not_connected',
        statusCode: 500,
        attributes: { 'db.system': 'falkordb' },
      });
    }

    // Convert params to FalkorDB format

    const command: string[] = ['GRAPH.QUERY', this.selectedGraph, withParams(cypher, params)];
    try {
      const result = await this.client.sendCommand(command, []);
      return this.mapResult(result, cypher, params);
    } catch (error) {
      throw classifyDriverError(error, 'falkordb');
    }
  }

  async runInTransaction<T>(work: (txc: TransactionContext) => Promise<T>): Promise<T> {
    if (!this.client) {
      raiseGraphError('FalkorDB not connected. Call connect() first.', {
        code: 'driver_not_connected',
        statusCode: 500,
        attributes: { 'db.system': 'falkordb' },
      });
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

    const boundary = driverErrorBoundary('falkordb');
    try {
      // Start transaction with MULTI
      await this.client.sendCommand(['MULTI'], []);

      const result = await boundary.user(() => work(txc));

      // Execute all queries
      for (const { cypher, params } of queries) {
        const queryCommand: string[] = [
          'GRAPH.QUERY',
          this.selectedGraph,
          withParams(cypher, params),
        ];
        await this.client.sendCommand(queryCommand, []);
      }

      // Execute transaction
      await this.client.sendCommand(['EXEC'], []);

      return result;
    } catch (error) {
      // Discard transaction
      await this.client.sendCommand(['DISCARD'], []).catch(() => {});
      throw boundary.classify(error);
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
