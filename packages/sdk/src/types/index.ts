// @graph-om/sdk/src/types/index.ts
// Core type definitions for Graph-OM

export type PropertyType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'date'
  | 'bigint'
  | 'float'
  | 'uuid'
  | 'json';

export type RelationDirection = 'IN' | 'OUT' | 'BOTH';

export interface PropertyConfig<T extends PropertyType = PropertyType> {
  type: T;
  primary?: boolean;
  unique?: boolean;
  index?: boolean;
  default?: PropertyTypeToJSType<T> | (() => PropertyTypeToJSType<T>);
  nullable?: boolean;
  array?: boolean;
}

export type PropertyTypeToJSType<T extends PropertyType> = T extends 'string'
  ? string
  : T extends 'number'
    ? number
    : T extends 'boolean'
      ? boolean
      : T extends 'date'
        ? Date
        : T extends 'bigint'
          ? bigint
          : T extends 'float'
            ? number
            : T extends 'uuid'
              ? string
              : T extends 'json'
                ? unknown
                : never;

export interface NodeConfig<TName extends string, TProps extends Record<string, PropertyConfig>> {
  label: TName;
  properties: TProps;
  relations: Record<string, RelationConfig<string, string>>;
  indexes?: Array<{ fields: string[]; unique?: boolean }>;
  constraints?: Array<{ fields: string[]; type: 'UNIQUE' | 'EXISTS' }>;
}

export interface RelationConfig<_TFrom extends string, TTo extends string> {
  type: string;
  direction: RelationDirection;
  target: TTo;
  properties?: Record<string, PropertyConfig>;
  multiple?: boolean;
  // Path traversal options
  path?: {
    minDepth?: number;
    maxDepth?: number;
    shortestPath?: boolean;
    filter?: WhereCondition<Record<string, unknown>>;
  };
  // Internal path traversal markers (added by schema helpers)
  _path?: {
    minDepth?: number;
    maxDepth?: number;
    relationshipFilter?: string;
    direction?: 'OUT' | 'IN' | 'BOTH';
  };
  _shortestPath?: boolean;
  _allShortestPaths?: boolean;
}

export type InferNodeProperties<
  TConfig extends NodeConfig<string, Record<string, PropertyConfig>>,
> = {
  [K in keyof TConfig['properties']]: TConfig['properties'][K]['nullable'] extends true
    ? PropertyTypeToJSType<TConfig['properties'][K]['type']> | null
    : PropertyTypeToJSType<TConfig['properties'][K]['type']>;
};

export type InferNodeRelations<TConfig extends NodeConfig<string, Record<string, PropertyConfig>>> =
  {
    [K in keyof TConfig['relations']]: TConfig['relations'][K]['multiple'] extends true
      ? InferNode<TConfig['relations'][K]['target']>[]
      : InferNode<TConfig['relations'][K]['target']> | null;
  };

/**
 * A registry of node names to their NodeConfig maps, as returned by `schema().build()`.
 */
export type GraphSchemaRegistry = Record<
  string,
  NodeConfig<string, Record<string, PropertyConfig>>
>;

/**
 * Resolve a node's inferred shape by label against a schema registry.
 * Falls back to a generic record for unknown labels.
 *
 * @example
 * ```ts
 * type User = InferNode<'User', typeof graph>;
 * ```
 */
export type InferNode<
  TName extends string = string,
  TRegistry extends GraphSchemaRegistry = GraphSchemaRegistry,
> = TName extends keyof TRegistry
  ? InferNodeProperties<TRegistry[TName]> & InferNodeRelations<TRegistry[TName]>
  : Record<string, unknown>;

export type InferRelationProperties<TConfig extends RelationConfig<string, string>> =
  TConfig['properties'] extends Record<string, PropertyConfig>
    ? {
        [K in keyof TConfig['properties']]: TConfig['properties'][K]['nullable'] extends true
          ? PropertyTypeToJSType<TConfig['properties'][K]['type']> | null
          : PropertyTypeToJSType<TConfig['properties'][K]['type']>;
      }
    : Record<string, unknown>;

// Type-level utilities for query building
export type WhereOperator<T> =
  | T
  | { eq: T }
  | { ne: T }
  | { gt: T }
  | { gte: T }
  | { lt: T }
  | { lte: T }
  | { contains: T }
  | { startsWith: T }
  | { endsWith: T }
  | { in: T[] }
  | { notIn: T[] }
  | { not: WhereOperator<T> };

export type WhereCondition<T> = {
  [K in keyof T]?: WhereOperator<T[K]>;
} & {
  AND?: WhereCondition<T>[];
  OR?: WhereCondition<T>[];
  NOT?: WhereCondition<T>;
};

export type OrderByDirection = 'asc' | 'desc';

export type OrderByInput<T> = {
  [K in keyof T]?: OrderByDirection;
};

export type AnyNodeConfig = NodeConfig<string, Record<string, PropertyConfig>>;

export type IncludeInput = {
  [relation: string]: boolean | IncludeInput | undefined;
};

export type SelectInput<T> = {
  [K in keyof T]?: boolean;
};

export type CreateInput<T> = {
  [K in keyof T]?: T[K] extends Date ? Date | string : T[K];
};

export type UpdateInput<T> = {
  [K in keyof T]?: T[K] extends Date ? Date | string : T[K];
};

export type RelationInput<T> =
  | { connect: { where: WhereCondition<T> } | { id: string } }
  | { disconnect: { where: WhereCondition<T> } | { id: string } }
  | { create: CreateInput<T> }
  | { set: CreateInput<T>[] }
  | { createMany: CreateInput<T>[] };

export type RelationWhereInput<T> = WhereCondition<T> & {
  every?: WhereCondition<T>;
  some?: WhereCondition<T>;
  none?: WhereCondition<T>;
};

// Client-level options types

/**
 * Blocks TypeScript from inferring `T` through a position — keeps `where`
 * clauses from producing bogus type inference on generic client methods.
 */
export type NoInferShim<T> = [T][T extends unknown ? 0 : never];

export interface FindManyOptions<T extends Record<string, unknown>> {
  where?: NoInferShim<WhereCondition<T>>;
  orderBy?: OrderByInput<T>;
  limit?: number;
  skip?: number;
  select?: SelectInput<T>;
  include?: IncludeInput;
}

export interface FindUniqueOptions<T extends Record<string, unknown>> {
  where: NoInferShim<WhereCondition<T> & { id?: string }>;
  include?: IncludeInput;
}

export interface CreateOptions<T extends Record<string, unknown>> {
  data: CreateInput<T>;
  relations?: Record<
    string,
    {
      connect?: { where: Record<string, unknown> } | { id: string };
      create?: CreateInput<Record<string, unknown>>;
    }
  >;
}

export interface UpdateOptions<T extends Record<string, unknown>> {
  where: NoInferShim<WhereCondition<T> & { id?: string }>;
  data: NoInferShim<UpdateInput<T>>;
}

export interface DeleteOptions<T extends Record<string, unknown>> {
  where: NoInferShim<WhereCondition<T> & { id?: string }>;
}

export interface UpsertOptions<T extends Record<string, unknown>> {
  where: NoInferShim<WhereCondition<T> & { id?: string }>;
  create: NoInferShim<CreateInput<T>>;
  update: NoInferShim<UpdateInput<T>>;
}

export interface GraphClientConfig {
  uri: string;
  username: string;
  password: string;
  database?: string;
  maxConnectionLifetime?: number;
  maxTransactionRetryTime?: number;
}

// Driver adapter types
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

export interface DriverAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  runQuery(cypher: string, params?: Record<string, unknown>): Promise<QueryResult>;
  runInTransaction<T>(work: (txc: TransactionContext) => Promise<T>): Promise<T>;
  runInReadTransaction<T>(work: (txc: TransactionContext) => Promise<T>): Promise<T>;
  verifyConnectivity(): Promise<boolean>;
  getServerInfo(): Promise<{ address: string; version: string; protocol: string }>;
}

// Config types
export interface GraphDriverConfig {
  type: 'neo4j';
  uri?: string;
  username?: string;
  password?: string;
  database?: string;
  maxConnectionLifetime?: number;
  maxTransactionRetryTime?: number;
}

export interface GraphOutputConfig {
  directory?: string;
  zod?: boolean;
}

export interface GraphConfig {
  schema: string;
  output?: GraphOutputConfig;
  driver?: GraphDriverConfig;
  debug?: boolean;
  exclude?: string[];
}
