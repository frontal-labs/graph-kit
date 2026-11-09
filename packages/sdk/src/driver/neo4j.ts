// @graph-kit/sdk/src/driver/neo4j.ts
// Neo4j driver adapter - wraps neo4j-driver with connection management

import neo4j, {
  type Driver,
  type ManagedTransaction,
  type QueryResult as Neo4jQueryResult,
  type Session,
} from 'neo4j-driver';
import { classifyDriverError, driverErrorBoundary, raiseGraphError } from '../errors';
import type {
  DriverAdapter,
  DriverCapabilities,
  DriverConfig,
  QueryResult,
  TransactionContext,
} from './index';

export interface Neo4jConfig extends DriverConfig {
  type: 'neo4j';
  uri: string;
  username: string;
  password: string;
  database?: string;
  maxConnectionLifetime?: number;
  maxTransactionRetryTime?: number;
  connectionAcquisitionTimeout?: number;
}

export interface Neo4jSessionConfig {
  database?: string;
  mode?: 'READ' | 'WRITE';
  bookmarks?: string | string[];
  fetchSize?: number;
}

/**
 * The driver cannot send a JavaScript Date (it arrives as an empty map and the write fails),
 * so Dates become Neo4j DateTime values on the way in, and come back as Dates.
 */
function toDriverValue(value: unknown): unknown {
  if (value instanceof Date) return neo4j.types.DateTime.fromStandardDate(value);
  if (Array.isArray(value)) return value.map(toDriverValue);
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, toDriverValue(item)]),
    );
  }
  return value;
}

function fromDriverValue(value: unknown): unknown {
  const types = neo4j.types;
  if (types?.DateTime && value instanceof types.DateTime) return value.toStandardDate();
  // Nodes and relationships keep their class; only their property values change
  if (types && (value instanceof types.Node || value instanceof types.Relationship)) {
    const entity = value as { properties: Record<string, unknown> };
    return Object.assign(Object.create(Object.getPrototypeOf(value)), value, {
      properties: fromDriverValue(entity.properties),
    });
  }
  if (Array.isArray(value)) return value.map(fromDriverValue);
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, fromDriverValue(item)]),
    );
  }
  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype
  );
}

export class Neo4jDriverAdapter implements DriverAdapter {
  private driver: Driver | null = null;
  private config: Neo4jConfig;
  private capabilities: DriverCapabilities;

  constructor(config: Neo4jConfig) {
    this.config = config;
    this.capabilities = {
      transactions: true,
      readReplicas: true,
      boltProtocol: true,
      httpProtocol: false,
      vectorSearch: true, // Neo4j 5.11+
      fullTextSearch: true,
      geospatial: true,
      procedures: ['apoc', 'gds', 'n10s'],
    };
  }

  async connect(): Promise<void> {
    if (this.driver) return;

    try {
      this.driver = neo4j.driver(
        this.config.uri,
        neo4j.auth.basic(this.config.username, this.config.password),
        {
          maxConnectionLifetime: this.config.maxConnectionLifetime ?? 3 * 60 * 60 * 1000,
          maxTransactionRetryTime: this.config.maxTransactionRetryTime ?? 30 * 1000,
          connectionAcquisitionTimeout: this.config.connectionAcquisitionTimeout ?? 10 * 1000,
          // Connection pooling
          maxConnectionPoolSize: 50,
          connectionTimeout: 10 * 1000,
        },
      );

      await this.driver.getServerInfo();
    } catch (error) {
      this.driver = null;
      raiseGraphError('Failed to connect to Neo4j', {
        code: 'connection_failed',
        statusCode: 503,
        retry: { retryable: true },
        cause: error,
        fix: 'Check NEO4J_URI, credentials, and that the database is reachable.',
        metadata: { uri: this.config.uri },
        attributes: { 'db.system': 'neo4j' },
      });
    }
  }

  async disconnect(): Promise<void> {
    if (this.driver) {
      await this.driver.close();
      this.driver = null;
    }
  }

  getDriver(): Driver {
    if (!this.driver) {
      raiseGraphError(
        'Neo4j driver not connected. Call connect() first or use GraphClient.connect().',
        {
          code: 'driver_not_connected',
          statusCode: 500,
          fix: 'Call connect() or GraphClient.connect() first.',
          attributes: { 'db.system': 'neo4j' },
        },
      );
    }
    return this.driver;
  }

  session(config?: Neo4jSessionConfig): Session {
    const driver = this.getDriver();
    return driver.session({
      database: config?.database ?? this.config.database,
      defaultAccessMode: config?.mode === 'READ' ? neo4j.session.READ : neo4j.session.WRITE,
      ...(config?.bookmarks ? { bookmarks: config.bookmarks } : {}),
      ...(config?.fetchSize ? { fetchSize: config.fetchSize } : {}),
    });
  }

  async runQuery(
    cypher: string,
    params?: Record<string, unknown>,
    sessionConfig?: Neo4jSessionConfig,
  ): Promise<QueryResult> {
    const session = this.session(sessionConfig);
    try {
      const result = await session.run(
        cypher,
        toDriverValue(params ?? {}) as Record<string, unknown>,
      );
      return this.mapResult(result);
    } catch (error) {
      throw classifyDriverError(error, 'neo4j');
    } finally {
      await session.close();
    }
  }

  async runInTransaction<T>(work: (txc: TransactionContext) => Promise<T>): Promise<T> {
    return this.runManaged(work, 'write');
  }

  async runInReadTransaction<T>(work: (txc: TransactionContext) => Promise<T>): Promise<T> {
    return this.runManaged(work, 'read');
  }

  /**
   * Shared body for both transaction kinds. Errors thrown by the caller's `work`
   * callback are rethrown unchanged; only driver failures are classified.
   */
  private async runManaged<T>(
    work: (txc: TransactionContext) => Promise<T>,
    mode: 'read' | 'write',
  ): Promise<T> {
    const session = this.session(mode === 'read' ? { mode: 'READ' } : undefined);
    const boundary = driverErrorBoundary('neo4j');
    const body = async (txc: ManagedTransaction) => {
      const wrappedTxc = {
        run: async (query: string, params?: Record<string, unknown>) => {
          try {
            const result = await txc.run(
              query,
              toDriverValue(params ?? {}) as Record<string, unknown>,
            );
            return this.mapResult(result);
          } catch (error) {
            throw classifyDriverError(error, 'neo4j');
          }
        },
      };
      return boundary.user(() => work(wrappedTxc));
    };
    try {
      return mode === 'read' ? await session.executeRead(body) : await session.executeWrite(body);
    } catch (error) {
      throw boundary.classify(error);
    } finally {
      await session.close();
    }
  }

  async verifyConnectivity(): Promise<boolean> {
    try {
      if (!this.driver) return false;
      await this.driver.verifyConnectivity();
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
    const info = await this.getDriver().getServerInfo();
    return {
      address: info.address ?? '',
      version: (info as { version?: string }).version ?? '',
      protocol: String((info as { protocolVersion?: number }).protocolVersion ?? ''),
    };
  }

  getCapabilities(): DriverCapabilities {
    return this.capabilities;
  }

  private mapResult(result: Neo4jQueryResult): QueryResult {
    const summary = result.summary;
    const records = (result.records ?? []).map((record) => ({
      keys: record.keys as string[],
      get: (key: string): unknown => {
        try {
          return fromDriverValue(record.get(key));
        } catch {
          return null;
        }
      },
      toObject: (): Record<string, unknown> => {
        try {
          return fromDriverValue(record.toObject()) as Record<string, unknown>;
        } catch {
          return {};
        }
      },
    }));

    const counterFns = summary?.counters as unknown as
      | Record<string, (() => number) | undefined>
      | undefined;
    const counter = (name: string): number => Number(counterFns?.[name]?.() ?? 0);

    return {
      records,
      summary: {
        query: {
          text: summary?.query?.text ?? '',
          parameters: (summary?.query?.parameters ?? {}) as Record<string, unknown>,
        },
        counters: {
          nodesCreated: counter('nodesCreated'),
          nodesDeleted: counter('nodesDeleted'),
          relationshipsCreated: counter('relationshipsCreated'),
          relationshipsDeleted: counter('relationshipsDeleted'),
          propertiesSet: counter('propertiesSet'),
          labelsAdded: counter('labelsAdded'),
          labelsRemoved: counter('labelsRemoved'),
          indexesAdded: counter('indexesAdded'),
          indexesRemoved: counter('indexesRemoved'),
          constraintsAdded: counter('constraintsAdded'),
          constraintsRemoved: counter('constraintsRemoved'),
        },
        notifications: (summary?.notifications ?? []).map((n) => ({
          code: n.code,
          title: n.title,
          description: n.description,
          severity: n.severity,
        })),
        resultAvailableAfter: Number(summary?.resultAvailableAfter ?? 0),
        resultConsumedAfter: Number(summary?.resultConsumedAfter ?? 0),
        database: { name: summary?.database?.name ?? '' },
      },
      keys: (result.records?.[0]?.keys ?? []) as string[],
    };
  }
}

export function createNeo4jDriver(config: Neo4jConfig): Neo4jDriverAdapter {
  return new Neo4jDriverAdapter(config);
}

export type { Driver, ManagedTransaction, Session } from 'neo4j-driver';
export { neo4j };
