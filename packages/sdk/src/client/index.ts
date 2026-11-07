// @graph-om/sdk/src/client/index.ts
// GraphClient - Type-safe graph database client

import { QueryCompiler, type RelationEndpoint } from '../query';
import type {
  CreateOptions,
  DeleteOptions,
  DriverAdapter,
  FindManyOptions,
  FindUniqueOptions,
  GraphConfig,
  IncludeInput,
  NodeConfig,
  NoInferShim,
  QueryResult,
  RelationConfig,
  TransactionContext,
  UpdateOptions,
  UpsertOptions,
  WhereCondition,
} from '../types';

export class GraphClient {
  private driver: DriverAdapter;
  private compiler: QueryCompiler;
  private schemaNodes: Map<string, NodeConfig<any, any>>;

  constructor(driver: DriverAdapter, schemaNodes?: Record<string, NodeConfig<any, any>>) {
    this.driver = driver;
    this.compiler = new QueryCompiler();
    this.schemaNodes = new Map();

    if (schemaNodes) {
      for (const [name, nodeConfig] of Object.entries(schemaNodes)) {
        this.schemaNodes.set(name, nodeConfig as NodeConfig<any, any>);
      }
    }
  }

  /**
   * Create a GraphClient from a driver adapter factory and optional config.
   *
   * @example
   * ```ts
   * import { createNeo4jDriver } from '@graph-om/neo4j'
   * const client = GraphClient.fromConfig(driver, { schema: './src/schema.ts' })
   * ```
   */
  static fromConfig(
    driverOrFactory: DriverAdapter | ((config?: any) => DriverAdapter),
    config?: Partial<GraphConfig>,
    schemaNodes?: Record<string, NodeConfig<any, any>>,
  ): GraphClient {
    const driver =
      typeof driverOrFactory === 'function' ? driverOrFactory(config?.driver) : driverOrFactory;
    return new GraphClient(driver, schemaNodes);
  }

  registerNode<TName extends string>(name: TName, config: NodeConfig<TName, any>): void {
    this.schemaNodes.set(name, config);
  }

  registerNodes(nodes: Record<string, NodeConfig<any, any>>): void {
    for (const [name, config] of Object.entries(nodes)) {
      this.schemaNodes.set(name, config);
    }
  }

  getDriver(): DriverAdapter {
    return this.driver;
  }

  async disconnect(): Promise<void> {
    await this.driver.disconnect();
  }

  getNodeConfig(label: string): NodeConfig<any, any> {
    const config = this.schemaNodes.get(label);
    if (!config) {
      throw new Error(
        `Node "${label}" is not registered in the schema. ` +
          `Did you forget to call registerNode() or pass schemaNodes to the constructor?`,
      );
    }
    return config;
  }

  async findMany<T extends Record<string, unknown>>(
    label: string,
    options: FindManyOptions<T> = {},
  ): Promise<T[]> {
    const nodeConfig = this.getNodeConfig(label);
    const query = this.compiler.compileFindMany(label, options);
    const result = await this.driver.runQuery(query.cypher, query.params);
    const records = result.records;
    const items = records.map((record) => this.toObject<T>(record));

    if (options.include && items.length > 0) {
      return await this.hydrateRelations(items, options.include, nodeConfig);
    }

    return items;
  }

  async findUnique<T extends Record<string, unknown>>(
    label: string,
    options: FindUniqueOptions<T>,
  ): Promise<T | null> {
    const nodeConfig = this.getNodeConfig(label);
    const query = this.compiler.compileFindUnique(label as string, options.where, nodeConfig);
    const result = await this.driver.runQuery(query.cypher, query.params);

    if (result.records.length === 0) return null;

    const record = result.records[0]!;
    const item = this.toObject<T>(record);

    if (options.include) {
      const hydrated = await this.hydrateRelations([item], options.include, nodeConfig);
      return hydrated[0] ?? null;
    }

    return item;
  }

  async create<T extends Record<string, unknown>>(
    label: string,
    options: CreateOptions<T>,
  ): Promise<T> {
    const nodeConfig = this.getNodeConfig(label);
    const query = options.relations
      ? this.compiler.compileCreateAndConnect(
          label as string,
          options.data,
          options.relations,
          nodeConfig,
        )
      : this.compiler.compileCreate(label as string, options.data, nodeConfig);

    const result = await this.driver.runQuery(query.cypher, query.params);
    if (result.records.length === 0) throw new Error(`Failed to create ${label}`);
    const record = result.records[0]!;
    return this.toObject<T>(record);
  }

  async update<T extends Record<string, unknown>>(
    label: string,
    options: UpdateOptions<T>,
  ): Promise<T> {
    const nodeConfig = this.getNodeConfig(label);
    const query = this.compiler.compileUpdate(
      label as string,
      options.where,
      options.data,
      nodeConfig,
    );
    const result = await this.driver.runQuery(query.cypher, query.params);

    if (result.records.length === 0) {
      throw new Error(`Failed to update ${label}: record not found`);
    }

    const record = result.records[0]!;
    return this.toObject<T>(record);
  }

  async delete<T extends Record<string, unknown>>(
    label: string,
    options: DeleteOptions<T>,
  ): Promise<void> {
    const nodeConfig = this.getNodeConfig(label);
    const query = this.compiler.compileDelete(label as string, options.where, nodeConfig);
    await this.driver.runQuery(query.cypher, query.params);
  }

  async upsert<T extends Record<string, unknown>>(
    label: string,
    options: UpsertOptions<T>,
  ): Promise<T> {
    const nodeConfig = this.getNodeConfig(label);
    const query = this.compiler.compileUpsert(
      label as string,
      options.where,
      options.create,
      options.update,
      nodeConfig,
    );
    const result = await this.driver.runQuery(query.cypher, query.params);
    const record = result.records[0]!;
    return this.toObject<T>(record);
  }

  async count(label: string, where?: WhereCondition<Record<string, unknown>>): Promise<number> {
    const query = this.compiler.compileAggregate(label, 'count', undefined, where);
    const result = await this.driver.runQuery(query.cypher, query.params);

    if (result.records.length === 0) return 0;
    const record = result.records[0]!;
    const value = record.get('result');
    return neo4jIntegerToNumber(value);
  }

  async aggregate(
    label: string,
    aggregation: 'count' | 'sum' | 'avg' | 'min' | 'max',
    field?: string,
    where?: WhereCondition<Record<string, unknown>>,
  ): Promise<number> {
    const query = this.compiler.compileAggregate(label, aggregation, field, where);
    const result = await this.driver.runQuery(query.cypher, query.params);

    if (result.records.length === 0) return 0;
    const record = result.records[0]!;
    const value = record.get('result');
    return neo4jIntegerToNumber(value);
  }

  /**
   * Creates a relationship between two nodes, matched by their primary key values.
   */
  async relate(
    fromLabel: string,
    fromId: string,
    relationType: string,
    toLabel: string,
    toId: string,
    direction: 'IN' | 'OUT' | 'BOTH' = 'OUT',
  ): Promise<void> {
    const query = this.compiler.compileCreateRelation(
      this.endpoint(fromLabel, fromId),
      relationType,
      this.endpoint(toLabel, toId),
      direction,
    );
    await this.driver.runQuery(query.cypher, query.params);
  }

  /**
   * Removes the relationships created by `relate` between two nodes.
   */
  async unrelate(
    fromLabel: string,
    fromId: string,
    relationType: string,
    toLabel: string,
    toId: string,
    direction: 'IN' | 'OUT' | 'BOTH' = 'OUT',
  ): Promise<void> {
    const query = this.compiler.compileDeleteRelation(
      this.endpoint(fromLabel, fromId),
      relationType,
      this.endpoint(toLabel, toId),
      direction,
    );
    await this.driver.runQuery(query.cypher, query.params);
  }

  private endpoint(label: string, value: string): RelationEndpoint {
    const config = this.getNodeConfig(label);
    const primary = Object.entries(config.properties).find(
      ([, prop]) => (prop as { primary?: boolean }).primary,
    );
    return { label, key: primary?.[0] ?? 'id', value };
  }

  async raw<T = Record<string, unknown>>(
    cypher: string,
    params?: Record<string, unknown>,
  ): Promise<T[]> {
    const query = this.compiler.compileRaw(cypher, params);
    const result = await this.driver.runQuery(query.cypher, query.params);
    return result.records.map((record) => this.toObject<T>(record));
  }

  async transaction<T>(work: (tx: GraphTransaction) => Promise<T>): Promise<T> {
    return await this.driver.runInTransaction(async (txc: TransactionContext) => {
      const tx = new GraphTransaction(this.compiler, txc, this.schemaNodes);
      return await work(tx);
    });
  }

  async traverse(
    fromLabel: string,
    relationType: string,
    toLabel: string,
    options: {
      fromId?: string;
      fromWhere?: Record<string, unknown>;
      minDepth?: number;
      maxDepth?: number;
      direction?: 'IN' | 'OUT' | 'BOTH';
      limit?: number;
    },
  ): Promise<Record<string, unknown>[]> {
    const query = this.compiler.compilePath(fromLabel, relationType, toLabel, options);
    const result = await this.driver.runQuery(query.cypher, query.params);
    return result.records.map((record) => this.toObject(record));
  }

  async findShortestPath(
    fromLabel: string,
    relationType: string,
    toLabel: string,
    options: {
      fromId?: string;
      fromWhere?: Record<string, unknown>;
      toId?: string;
      toWhere?: Record<string, unknown>;
      maxDepth?: number;
      direction?: 'IN' | 'OUT' | 'BOTH';
    },
  ): Promise<{ nodes: Record<string, unknown>[]; path: unknown } | null> {
    const query = this.compiler.compileShortestPath(fromLabel, relationType, toLabel, options);
    const result = await this.driver.runQuery(query.cypher, query.params);
    if (result.records.length === 0) return null;
    const record = result.records[0]!;
    return {
      nodes: [this.toObject(record.get('n')), this.toObject(record.get('m'))],
      path: record.get('path'),
    };
  }

  async findAllShortestPaths(
    fromLabel: string,
    relationType: string,
    toLabel: string,
    options: {
      fromId?: string;
      fromWhere?: Record<string, unknown>;
      toId?: string;
      toWhere?: Record<string, unknown>;
      maxDepth?: number;
      direction?: 'IN' | 'OUT' | 'BOTH';
    },
  ): Promise<{ nodes: Record<string, unknown>[]; path: unknown }[]> {
    const query = this.compiler.compileAllShortestPaths(fromLabel, relationType, toLabel, options);
    const result = await this.driver.runQuery(query.cypher, query.params);
    return result.records.map((record) => ({
      nodes: [this.toObject(record.get('n')), this.toObject(record.get('m'))],
      path: record.get('path'),
    }));
  }

  private async hydrateRelations<T extends Record<string, unknown>>(
    items: T[],
    include: IncludeInput<Record<string, any>>,
    nodeConfig: NodeConfig<any, any>,
  ): Promise<T[]> {
    for (const [relName, includeConfig] of Object.entries(include)) {
      if (!includeConfig) continue;

      const relConfig = nodeConfig.relations[relName] as RelationConfig<string, string> | undefined;
      if (!relConfig) continue;

      const ids = items
        .map((item) => (item as Record<string, unknown>)['id'])
        .filter((id) => id !== undefined && id !== null)
        .map(String);
      if (ids.length === 0) continue;

      const fromAlias = 'a';
      const targetAlias = 'b';
      const targetPattern = `(${targetAlias}:${relConfig.target})`;
      let pattern: string;
      if (relConfig.direction === 'IN') {
        pattern = `(${fromAlias}:${nodeConfig.label} {id: sourceId})<-[r:${relConfig.type}]-${targetPattern}`;
      } else if (relConfig.direction === 'BOTH') {
        pattern = `(${fromAlias}:${nodeConfig.label} {id: sourceId})-[r:${relConfig.type}]-${targetPattern}`;
      } else {
        pattern = `(${fromAlias}:${nodeConfig.label} {id: sourceId})-[r:${relConfig.type}]->${targetPattern}`;
      }

      const cypher = `UNWIND $ids AS sourceId\nMATCH ${pattern}\nRETURN sourceId, ${targetAlias}`;
      const result = await this.driver.runQuery(cypher, { ids });

      const grouped = new Map<string, Record<string, unknown>[]>();
      for (const record of result.records) {
        const sourceId = String(record.get('sourceId'));
        const node: unknown = record.get(targetAlias);
        const target = isNodeLike(node)
          ? toPlainRecord<Record<string, unknown>>(node.properties)
          : this.toObject<Record<string, unknown>>(node ?? {});
        let bucket = grouped.get(sourceId);
        if (!bucket) {
          bucket = [];
          grouped.set(sourceId, bucket);
        }
        bucket.push(target);
      }

      let allTargets: Record<string, unknown>[] = [];
      for (const bucket of grouped.values()) {
        allTargets.push(...bucket);
      }

      if (typeof includeConfig === 'object') {
        const targetNodeConfig = this.schemaNodes.get(relConfig.target);
        if (targetNodeConfig && allTargets.length > 0) {
          allTargets = await this.hydrateRelations(
            allTargets,
            includeConfig as IncludeInput<Record<string, any>>,
            targetNodeConfig,
          );
          // Re-link hydrated objects back into their buckets by id
        }
      }

      for (const item of items) {
        const itemId = String((item as Record<string, unknown>)['id'] ?? '');
        const targets = grouped.get(itemId) ?? [];

        if (typeof includeConfig === 'object') {
          // buckets hold references that hydrateRelations mutated in place
          const rel = relConfig.multiple ? targets : targets.length > 0 ? targets[0]! : null;
          (item as Record<string, unknown>)[String(relName)] = rel;
        } else if (relConfig.multiple) {
          (item as Record<string, unknown>)[String(relName)] = targets;
        } else {
          (item as Record<string, unknown>)[String(relName)] =
            targets.length > 0 ? targets[0]! : null;
        }
      }
    }

    return items;
  }

  private toObject<T>(record: unknown): T {
    if (record === null || typeof record !== 'object') {
      return record as T;
    }
    const obj =
      typeof (record as { toObject?: unknown }).toObject === 'function'
        ? (record as { toObject(): Record<string, unknown> }).toObject()
        : (record as Record<string, unknown>);
    return toPlainRecord<T>(obj);
  }
}

export class GraphTransaction {
  private compiler: QueryCompiler;
  private txc: TransactionContext;
  private schemaNodes: Map<string, NodeConfig<any, any>>;

  constructor(
    compiler: QueryCompiler,
    txc: TransactionContext,
    schemaNodes: Map<string, NodeConfig<any, any>>,
  ) {
    this.compiler = compiler;
    this.txc = txc;
    this.schemaNodes = schemaNodes;
  }

  private async runQuery(cypher: string, params: Record<string, unknown>): Promise<QueryResult> {
    return await this.txc.run(cypher, params);
  }

  private toObject<T>(record: any): T {
    const obj = typeof record?.toObject === 'function' ? record.toObject() : record;
    if (!obj || typeof obj !== 'object') return obj as T;
    return toPlainRecord<T>(obj);
  }

  getNodeConfig(label: string): NodeConfig<any, any> {
    const config = this.schemaNodes.get(label);
    if (!config) {
      throw new Error(`Node "${label}" is not registered in the schema.`);
    }
    return config;
  }

  async findOne<T extends Record<string, unknown>>(
    label: string,
    where: NoInferShim<WhereCondition<T> & { id?: string }>,
  ): Promise<T | null> {
    const nodeConfig = this.getNodeConfig(label);
    const query = this.compiler.compileFindUnique(label, where, nodeConfig);
    if (!query.cypher) return null;

    const result = await this.runQuery(query.cypher, query.params);
    if (result.records.length === 0) return null;
    return this.toObject<T>(result.records[0]);
  }

  async findMany<T extends Record<string, unknown>>(
    label: string,
    options: FindManyOptions<T> = {},
  ): Promise<T[]> {
    const query = this.compiler.compileFindMany(label, options);
    const result = await this.runQuery(query.cypher, query.params);
    return result.records.map((r) => this.toObject<T>(r));
  }

  async create<T extends Record<string, unknown>>(
    label: string,
    options: CreateOptions<T>,
  ): Promise<T> {
    const nodeConfig = this.getNodeConfig(label);
    const query = options.relations
      ? this.compiler.compileCreateAndConnect(label, options.data, options.relations, nodeConfig)
      : this.compiler.compileCreate(label, options.data, nodeConfig);
    const result = await this.runQuery(query.cypher, query.params);
    if (result.records.length === 0) throw new Error(`Failed to create ${label}`);
    return this.toObject<T>(result.records[0]);
  }

  async update<T extends Record<string, unknown>>(
    label: string,
    options: UpdateOptions<T>,
  ): Promise<T> {
    const nodeConfig = this.getNodeConfig(label);
    const query = this.compiler.compileUpdate(label, options.where, options.data, nodeConfig);
    const result = await this.runQuery(query.cypher, query.params);
    if (result.records.length === 0) throw new Error(`Failed to update ${label}: record not found`);
    return this.toObject<T>(result.records[0]);
  }

  async delete<T extends Record<string, unknown>>(
    label: string,
    options: DeleteOptions<T>,
  ): Promise<void> {
    const nodeConfig = this.getNodeConfig(label);
    const query = this.compiler.compileDelete(label, options.where, nodeConfig);
    await this.runQuery(query.cypher, query.params);
  }

  async raw<T = Record<string, unknown>>(
    cypher: string,
    params?: Record<string, unknown>,
  ): Promise<T[]> {
    const query = this.compiler.compileRaw(cypher, params);
    const result = await this.runQuery(query.cypher, query.params);
    return result.records.map((r) => this.toObject<T>(r));
  }

  async traverse(
    fromLabel: string,
    relationType: string,
    toLabel: string,
    options: {
      fromId?: string;
      fromWhere?: Record<string, unknown>;
      minDepth?: number;
      maxDepth?: number;
      direction?: 'IN' | 'OUT' | 'BOTH';
      limit?: number;
    },
  ): Promise<Record<string, unknown>[]> {
    const query = this.compiler.compilePath(fromLabel, relationType, toLabel, options);
    const result = await this.runQuery(query.cypher, query.params);
    return result.records.map((record) => this.toObject<Record<string, unknown>>(record));
  }
}

interface Neo4jLikeInteger {
  low: number;
  high: number;
  toNumber?: () => number;
}

interface Neo4jLikeTemporal {
  toDate?: () => Date;
  toString(): string;
}

function isNeo4jInteger(value: object): value is Neo4jLikeInteger {
  const v = value as Record<string, unknown>;
  return typeof v['low'] === 'number' && typeof v['high'] === 'number';
}

function isNodeLike(value: unknown): value is { properties: Record<string, unknown> } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'properties' in value &&
    typeof (value as { properties: unknown }).properties === 'object'
  );
}

/**
 * Converts a driver record to a plain object. A record that returns a single node
 * (`RETURN n`, `RETURN m`) is unwrapped to that node's properties.
 */
function toPlainRecord<T>(obj: Record<string, unknown>): T {
  const keys = Object.keys(obj);
  const only = keys.length === 1 ? obj[keys[0]!] : undefined;
  const source = isNodeLike(only) ? only.properties : obj;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(source)) {
    result[key] = parseNeo4jValue(source[key]);
  }
  return result as T;
}

function parseNeo4jValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;

  if (value instanceof Date) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(parseNeo4jValue);
  }

  if (typeof value === 'object') {
    const v = value as Record<string, unknown>;

    if (isNeo4jInteger(value)) {
      return neo4jIntegerToNumber(value);
    }

    if (typeof v['toDate'] === 'function') {
      try {
        return new Date(String(value));
      } catch {
        return String(value);
      }
    }

    if (typeof v['toNumber'] === 'function') {
      return (v['toNumber'] as () => number)();
    }
  }

  return value;
}

function neo4jIntegerToNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'object') {
    const v = value as Neo4jLikeInteger & Partial<Neo4jLikeTemporal>;
    if (typeof v.toNumber === 'function') return v.toNumber();
    if (typeof v.low === 'number') return v.low;
  }
  return Number(value);
}

export { neo4jIntegerToNumber, parseNeo4jValue };
