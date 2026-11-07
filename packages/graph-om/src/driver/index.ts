// @graph-om/graph-om/src/driver/index.ts
// Driver adapter abstraction for multi-database support (types only - implementations in separate packages)

import type { DriverCapabilities, QueryResult, TransactionContext } from './index';

// Base driver config (defined inline to avoid circular imports)
interface BaseDriverConfig {
  type: string;
  uri?: string;
  username?: string;
  password?: string;
  database?: string;
  maxConnectionLifetime?: number;
  maxTransactionRetryTime?: number;
  connectionAcquisitionTimeout?: number;
}

// Kuzu driver config (defined here to avoid Rollup static analysis issues with kuzu.ts)
export interface KuzuConfig {
  type: 'kuzu';
  databasePath: string;
  uri: string; // For network mode (required by base DriverConfig)
  username: string;
  password: string;
  // Driver-specific options
  [key: string]: unknown;
}

// Kuzu driver adapter interface (defined here to avoid Rollup static analysis issues with kuzu.ts)
export interface KuzuDriverAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  runQuery(cypher: string, params?: Record<string, unknown>): Promise<QueryResult>;
  runInTransaction<T>(work: (txc: TransactionContext) => Promise<T>): Promise<T>;
  runInReadTransaction<T>(work: (txc: TransactionContext) => Promise<T>): Promise<T>;
  verifyConnectivity(): Promise<boolean>;
  getServerInfo(): Promise<{ address: string; version: string; protocol: string }>;
  getCapabilities(): DriverCapabilities;
}

// Factory function for Kuzu driver (synchronous version - throws error to guide user to async version)
export function createKuzuDriver(_config: KuzuConfig): KuzuDriverAdapter {
  throw new Error('Kuzu driver requires async initialization. Use createKuzuDriverAsync instead.');
}

// Async version of the factory function
export async function createKuzuDriverAsync(config: KuzuConfig): Promise<KuzuDriverAdapter> {
  const { KuzuDriverAdapter: KuzuDriverAdapterImpl } = await import('./kuzu.js');
  return new KuzuDriverAdapterImpl(config);
}

export interface DriverCapabilities {
  transactions: boolean;
  readReplicas: boolean;
  boltProtocol: boolean;
  httpProtocol: boolean;
  vectorSearch: boolean;
  fullTextSearch: boolean;
  geospatial: boolean;
  procedures: string[];
}

// Base driver config - specific drivers extend this
export interface DriverConfig {
  type: string;
  uri?: string;
  username?: string;
  password?: string;
  database?: string;
  maxConnectionLifetime?: number;
  maxTransactionRetryTime?: number;
  connectionAcquisitionTimeout?: number;
  // Driver-specific options
  [key: string]: unknown;
}

// Specific driver configs
export interface Neo4jDriverConfig extends DriverConfig {
  type: 'neo4j';
  uri: string;
  username: string;
  password: string;
  database?: string;
  maxConnectionLifetime?: number;
  maxTransactionRetryTime?: number;
  connectionAcquisitionTimeout?: number;
}

export interface MemgraphDriverConfig extends DriverConfig {
  type: 'memgraph';
  uri: string;
  username: string;
  password: string;
  database?: string;
  useSSL?: boolean;
  sslCa?: string;
  maxConnectionPoolSize?: number;
}

export interface KuzuDriverConfig extends DriverConfig {
  type: 'kuzu';
  databasePath: string;
  uri?: string;
  username?: string;
  password?: string;
}

export interface FalkorDBDriverConfig extends DriverConfig {
  type: 'falkordb';
  host: string;
  port: number;
  graphName: string;
  password?: string;
  database?: string;
  maxRetriesPerRequest?: number;
  enableReadyCheck?: boolean;
  lazyConnect?: boolean;
}

export type AnyDriverConfig =
  | Neo4jDriverConfig
  | MemgraphDriverConfig
  | KuzuDriverConfig
  | FalkorDBDriverConfig;

// Query result types
export interface QueryResult {
  records: QueryRecord[];
  summary: {
    query: { text: string; parameters: Record<string, unknown> };
    counters: Record<string, number>;
    notifications: Array<Record<string, unknown>>;
    resultAvailableAfter: number;
    resultConsumedAfter: number;
    database: { name: string };
  };
  keys: string[];
}

export interface QueryRecord {
  keys: string[];
  get(key: string): unknown;
  toObject(): Record<string, unknown>;
}

export interface TransactionContext {
  run(query: string, params?: Record<string, unknown>): Promise<QueryResult>;
}

// Driver adapter interface
export interface DriverAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  runQuery(cypher: string, params?: Record<string, unknown>): Promise<QueryResult>;
  runInTransaction<T>(work: (txc: TransactionContext) => Promise<T>): Promise<T>;
  runInReadTransaction<T>(work: (txc: TransactionContext) => Promise<T>): Promise<T>;
  verifyConnectivity(): Promise<boolean>;
  getServerInfo(): Promise<{ address: string; version: string; protocol: string }>;
  getCapabilities(): DriverCapabilities;
}

// Factory type - uses generics to allow specific config types
export type DriverFactory<Config extends DriverConfig = DriverConfig> = (
  config: Config,
) => DriverAdapter;

const driverRegistry = new Map<string, DriverFactory<any>>();

export function registerDriver(type: string, factory: DriverFactory<any>): void {
  driverRegistry.set(type.toLowerCase(), factory);
}

export function getDriverFactory(type: string): DriverFactory<any> | undefined {
  return driverRegistry.get(type.toLowerCase());
}

export function createDriver(config: AnyDriverConfig): DriverAdapter {
  const factory = getDriverFactory(config.type);
  if (!factory) {
    const available = [...driverRegistry.keys()].join(', ');
    throw new Error(`Unknown driver type: "${config.type}". Available: ${available || 'none'}`);
  }
  return factory(config);
}

export function listDrivers(): string[] {
  return [...driverRegistry.keys()];
}

// Helper to define driver config with type safety
export function defineDriverConfig<Config extends DriverConfig>(config: Config): Config {
  return config;
}
