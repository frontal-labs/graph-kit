// @graph-om/memgraph/src/index.ts
// Memgraph driver adapter - wraps neo4j-driver with Memgraph-specific configuration

import type {
  DriverAdapter,
  DriverCapabilities,
  MemgraphDriverConfig,
  QueryRecord,
  QueryResult,
  TransactionContext,
} from '@graph-om/sdk';
import neo4j, {
  type Driver,
  type ManagedTransaction as Neo4jManagedTransaction,
  type QueryResult as Neo4jQueryResult,
  type Record as Neo4jRecord,
} from 'neo4j-driver';

// Counter shape returned by Memgraph; older releases nest the values under _stats or stats
type CounterFields = {
  nodesCreated?: number;
  nodesDeleted?: number;
  relationshipsCreated?: number;
  relationshipsDeleted?: number;
  propertiesSet?: number;
  labelsAdded?: number;
  labelsRemoved?: number;
  indexesAdded?: number;
  indexesRemoved?: number;
  constraintsAdded?: number;
  constraintsRemoved?: number;
};
type CounterSource = CounterFields & { _stats?: CounterFields; stats?: CounterFields };

export class MemgraphDriverAdapter implements DriverAdapter {
  private driver: Driver;
  private config: MemgraphDriverConfig;
  private capabilities: DriverCapabilities;

  constructor(config: MemgraphDriverConfig) {
    this.config = config;
    this.driver = neo4j.driver(config.uri, neo4j.auth.basic(config.username, config.password), {
      maxConnectionLifetime: config.maxConnectionLifetime ?? 3600000,
      maxConnectionPoolSize: config.maxConnectionPoolSize ?? 50,
      connectionAcquisitionTimeout: config.connectionAcquisitionTimeout ?? 60000,
      disableLosslessIntegers: true,
      // driverConfig is not spread to avoid type issues
    });

    this.capabilities = {
      transactions: true,
      readReplicas: false,
      boltProtocol: true,
      httpProtocol: false,
      vectorSearch: false,
      fullTextSearch: false,
      geospatial: false,
      procedures: [],
    };
  }

  async connect(): Promise<void> {
    await this.driver.verifyConnectivity();
  }

  async disconnect(): Promise<void> {
    await this.driver.close();
  }

  async runQuery(cypher: string, params?: Record<string, unknown>): Promise<QueryResult> {
    const session = this.driver.session({ database: this.config.database });
    try {
      const result = await session.run(cypher, params);
      return this.mapResult(result);
    } finally {
      await session.close();
    }
  }

  async runInTransaction<T>(work: (txc: TransactionContext) => Promise<T>): Promise<T> {
    const session = this.driver.session({ database: this.config.database });
    try {
      const result = await session.executeWrite(async (txc) => {
        return work(this.createTransactionContext(txc));
      });
      return result;
    } finally {
      await session.close();
    }
  }

  async runInReadTransaction<T>(work: (txc: TransactionContext) => Promise<T>): Promise<T> {
    const session = this.driver.session({
      database: this.config.database,
      defaultAccessMode: neo4j.session.READ,
    });
    try {
      const result = await session.executeRead(async (txc) => {
        return work(this.createTransactionContext(txc));
      });
      return result;
    } finally {
      await session.close();
    }
  }

  async verifyConnectivity(): Promise<boolean> {
    try {
      await this.driver.verifyConnectivity();
      return true;
    } catch {
      return false;
    }
  }

  async getServerInfo(): Promise<{ address: string; version: string; protocol: string }> {
    const session = this.driver.session({ database: this.config.database });
    try {
      const result = await session.run(
        'CALL dbms.components() YIELD name, versions, edition RETURN name, versions[0] as version, edition',
      );
      const record = result.records[0];
      if (!record) {
        throw new Error('Memgraph returned no component information');
      }
      return {
        address: this.config.uri,
        version: record.get('version') as string,
        protocol: 'bolt',
      };
    } finally {
      await session.close();
    }
  }

  getCapabilities(): DriverCapabilities {
    return this.capabilities;
  }

  private createTransactionContext(txc: Neo4jManagedTransaction): TransactionContext {
    return {
      run: async (query: string, params?: Record<string, unknown>): Promise<QueryResult> => {
        const result = await txc.run(query, params);
        return this.mapResult(result);
      },
    };
  }

  private mapResult(result: Neo4jQueryResult): QueryResult {
    return {
      records: result.records.map((record) => this.mapRecord(record)),
      summary: {
        query: {
          text: result.summary?.query?.text ?? '',
          parameters: result.summary?.query?.parameters ?? {},
        },
        counters: this.mapCounters(result.summary?.counters),
        notifications: (result.summary?.notifications ?? []).map((n) => ({
          code: n.code,
          title: n.title,
          description: n.description,
          position: n.position,
          severity: n.severity,
        })),
        database: { name: this.config.database ?? 'memgraph' },
        resultAvailableAfter: neo4j.integer.toNumber(result.summary?.resultAvailableAfter ?? 0),
        resultConsumedAfter: neo4j.integer.toNumber(result.summary?.resultConsumedAfter ?? 0),
      },
      keys: result.records[0]?.keys.map(String) ?? [],
    };
  }

  private mapRecord(record: Neo4jRecord): QueryRecord {
    const obj: Record<string, unknown> = {};
    const keys = record.keys.map(String);
    for (const key of keys) {
      obj[key] = record.get(key);
    }
    return {
      keys,
      get: (key: string) => obj[key],
      toObject: () => ({ ...obj }),
    };
  }

  private mapCounters(counters: unknown): Record<string, number> {
    if (!counters)
      return {
        nodesCreated: 0,
        nodesDeleted: 0,
        relationshipsCreated: 0,
        relationshipsDeleted: 0,
        propertiesSet: 0,
        labelsAdded: 0,
        labelsRemoved: 0,
        indexesAdded: 0,
        indexesRemoved: 0,
        constraintsAdded: 0,
        constraintsRemoved: 0,
      };

    // Handle different counter formats
    const source = counters as CounterSource;
    const stats = source._stats ?? source.stats ?? source;
    return {
      nodesCreated: stats.nodesCreated ?? 0,
      nodesDeleted: stats.nodesDeleted ?? 0,
      relationshipsCreated: stats.relationshipsCreated ?? 0,
      relationshipsDeleted: stats.relationshipsDeleted ?? 0,
      propertiesSet: stats.propertiesSet ?? 0,
      labelsAdded: stats.labelsAdded ?? 0,
      labelsRemoved: stats.labelsRemoved ?? 0,
      indexesAdded: stats.indexesAdded ?? 0,
      indexesRemoved: stats.indexesRemoved ?? 0,
      constraintsAdded: stats.constraintsAdded ?? 0,
      constraintsRemoved: stats.constraintsRemoved ?? 0,
    };
  }
}

export function createMemgraphDriver(config: MemgraphDriverConfig): MemgraphDriverAdapter {
  return new MemgraphDriverAdapter(config);
}

export { neo4j };
