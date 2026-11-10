// @graph-kit/sdk/src/driver/memgraph.ts
// Memgraph driver adapter - Memgraph is compatible with Neo4j Bolt protocol
// Can use neo4j-driver with some adjustments

import type {
  DriverAdapter,
  DriverCapabilities,
  DriverConfig,
  QueryResult,
  TransactionContext,
} from './index';
import { createNeo4jDriver, type Neo4jConfig, type Neo4jDriverAdapter } from './neo4j';

export interface MemgraphConfig extends DriverConfig {
  type: 'memgraph';
  uri: string;
  username: string;
  password: string;
  database?: string;
  useSSL?: boolean;
  sslCa?: string;
  maxConnectionLifetime?: number;
  maxTransactionRetryTime?: number;
  connectionAcquisitionTimeout?: number;
}

export class MemgraphDriverAdapter implements DriverAdapter {
  private neo4jAdapter: Neo4jDriverAdapter;
  private capabilities: DriverCapabilities;

  constructor(config: MemgraphConfig) {
    this.capabilities = {
      transactions: true,
      readReplicas: false, // Memgraph doesn't support read replicas in same way
      boltProtocol: true,
      httpProtocol: false,
      vectorSearch: true, // Memgraph supports vector search
      fullTextSearch: false, // Limited full-text search
      geospatial: true,
      procedures: ['mg', 'mgp'], // Memgraph procedures
    };

    // Convert Memgraph config to Neo4j config
    const neo4jConfig: Neo4jConfig = {
      type: 'neo4j',
      uri: config.uri,
      username: config.username,
      password: config.password,
      database: config.database,
      maxConnectionLifetime: config.maxConnectionLifetime,
      maxTransactionRetryTime: config.maxTransactionRetryTime,
      connectionAcquisitionTimeout: config.connectionAcquisitionTimeout,
    };

    this.neo4jAdapter = createNeo4jDriver(neo4jConfig);
  }

  async connect(): Promise<void> {
    await this.neo4jAdapter.connect();
  }

  async disconnect(): Promise<void> {
    await this.neo4jAdapter.disconnect();
  }

  async runQuery(cypher: string, params?: Record<string, unknown>): Promise<QueryResult> {
    // Memgraph uses openCypher which is largely compatible with Neo4j Cypher
    // Some differences: no CALL db.index.*, different procedure names
    return this.neo4jAdapter.runQuery(cypher, params);
  }

  async runInTransaction<T>(work: (txc: TransactionContext) => Promise<T>): Promise<T> {
    return this.neo4jAdapter.runInTransaction(work);
  }

  async runInReadTransaction<T>(work: (txc: TransactionContext) => Promise<T>): Promise<T> {
    return this.neo4jAdapter.runInReadTransaction(work);
  }

  async verifyConnectivity(): Promise<boolean> {
    return this.neo4jAdapter.verifyConnectivity();
  }

  async getServerInfo(): Promise<{
    address: string;
    version: string;
    protocol: string;
  }> {
    const info = await this.neo4jAdapter.getServerInfo();
    return {
      ...info,
      protocol: 'bolt',
    };
  }

  getCapabilities(): DriverCapabilities {
    return this.capabilities;
  }
}

export function createMemgraphDriver(config: MemgraphConfig): MemgraphDriverAdapter {
  return new MemgraphDriverAdapter(config);
}
