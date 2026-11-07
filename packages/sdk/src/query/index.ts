// @graph-om/sdk/src/query/index.ts
// Cypher query compiler - translates high-level queries to optimized Cypher

import type {
  AnyNodeConfig,
  CreateInput,
  IncludeInput,
  NoInferShim,
  OrderByInput,
  PropertyConfig,
  RelationConfig,
  SelectInput,
  UpdateInput,
  WhereCondition,
} from '../types';

export interface CompiledQuery {
  cypher: string;
  params: Record<string, unknown>;
}

/** One side of a relationship: the node label, its key property, and the key's value */
export interface RelationEndpoint {
  label: string;
  key: string;
  value: unknown;
}

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

function assertIdentifier(name: string, what: string): void {
  if (!IDENTIFIER.test(name)) {
    throw new Error(`Invalid ${what}: "${name}"`);
  }
}

function safeLabel(endpoint: RelationEndpoint): string {
  assertIdentifier(endpoint.label, 'node label');
  return endpoint.label;
}

function safeKey(endpoint: RelationEndpoint): string {
  assertIdentifier(endpoint.key, 'property key');
  return endpoint.key;
}

function relationArrow(relationType: string, direction: 'IN' | 'OUT' | 'BOTH'): string {
  if (direction === 'OUT') return `-[r:${relationType}]->`;
  if (direction === 'IN') return `<-[r:${relationType}]-`;
  return `-[r:${relationType}]-`;
}

export class QueryCompiler {
  private paramCounter = 0;

  reset(): void {
    this.paramCounter = 0;
  }

  nextParam(prefix: string = 'p'): string {
    this.paramCounter++;
    return `${prefix}${this.paramCounter}`;
  }

  compileWhere<T extends Record<string, unknown>>(
    where: WhereCondition<T> | undefined,
    nodeAlias: string = 'n',
  ): CompiledQuery {
    if (!where) {
      return { cypher: '', params: {} };
    }

    const conditions: string[] = [];
    const params: Record<string, unknown> = {};

    const processedKeys = new Set<string>();

    for (const [key, value] of Object.entries(where)) {
      if (key === 'AND' || key === 'OR' || key === 'NOT') continue;
      if (typeof value === 'undefined') continue;

      processedKeys.add(key);
      const paramName = this.nextParam(key as string);
      const propRef = `${nodeAlias}.${String(key)}`;

      if (
        value !== null &&
        typeof value === 'object' &&
        !(value instanceof Date) &&
        !Array.isArray(value)
      ) {
        const operator = value as Record<string, unknown>;
        if ('eq' in operator) {
          conditions.push(`${propRef} = $${paramName}`);
          params[paramName] = operator['eq'];
        } else if ('ne' in operator) {
          conditions.push(`${propRef} <> $${paramName}`);
          params[paramName] = operator['ne'];
        } else if ('gt' in operator) {
          conditions.push(`${propRef} > $${paramName}`);
          params[paramName] = operator['gt'];
        } else if ('gte' in operator) {
          conditions.push(`${propRef} >= $${paramName}`);
          params[paramName] = operator['gte'];
        } else if ('lt' in operator) {
          conditions.push(`${propRef} < $${paramName}`);
          params[paramName] = operator['lt'];
        } else if ('lte' in operator) {
          conditions.push(`${propRef} <= $${paramName}`);
          params[paramName] = operator['lte'];
        } else if ('contains' in operator) {
          conditions.push(`${propRef} CONTAINS $${paramName}`);
          params[paramName] = operator['contains'];
        } else if ('startsWith' in operator) {
          conditions.push(`${propRef} STARTS WITH $${paramName}`);
          params[paramName] = operator['startsWith'];
        } else if ('endsWith' in operator) {
          conditions.push(`${propRef} ENDS WITH $${paramName}`);
          params[paramName] = operator['endsWith'];
        } else if ('in' in operator) {
          conditions.push(`${propRef} IN $${paramName}`);
          params[paramName] = operator['in'];
        } else if ('notIn' in operator) {
          conditions.push(`NOT ${propRef} IN $${paramName}`);
          params[paramName] = operator['notIn'];
        } else if ('not' in operator) {
          const nested = this.compileNestedWhere(
            { [key]: operator['not'] } as WhereCondition<Record<string, unknown>>,
            nodeAlias,
          );
          conditions.push(`NOT (${nested.cypher})`);
          Object.assign(params, nested.params);
        } else {
          conditions.push(`${propRef} = $${paramName}`);
          params[paramName] = value;
        }
      } else {
        conditions.push(`${propRef} = $${paramName}`);
        params[paramName] = value;
      }
    }

    if (where.AND && Array.isArray(where.AND)) {
      for (const cond of where.AND) {
        const nested = this.compileWhere(cond as WhereCondition<T>, nodeAlias);
        if (nested.cypher) {
          conditions.push(nested.cypher);
        }
        Object.assign(params, nested.params);
      }
    }

    if (where.OR && Array.isArray(where.OR)) {
      const orConditions: string[] = [];
      for (const cond of where.OR) {
        const nested = this.compileWhere(cond as WhereCondition<T>, nodeAlias);
        if (nested.cypher) {
          orConditions.push(nested.cypher);
        }
        Object.assign(params, nested.params);
      }
      if (orConditions.length > 0) {
        conditions.push(`(${orConditions.join(' OR ')})`);
      }
    }

    if (where.NOT) {
      const nested = this.compileWhere(where.NOT as WhereCondition<T>, nodeAlias);
      if (nested.cypher) {
        conditions.push(`NOT (${nested.cypher})`);
      }
      Object.assign(params, nested.params);
    }

    if (conditions.length === 0) {
      return { cypher: '', params: {} };
    }

    return { cypher: conditions.join(' AND '), params };
  }

  private compileNestedWhere<T>(value: Record<string, unknown>, nodeAlias: string): CompiledQuery {
    return this.compileWhere(value as WhereCondition<T>, nodeAlias);
  }

  compileOrderBy<T>(orderBy: OrderByInput<T> | undefined, nodeAlias: string = 'n'): string {
    if (!orderBy) return '';

    const clauses: string[] = [];
    for (const [key, direction] of Object.entries(orderBy)) {
      if (direction) {
        clauses.push(`${nodeAlias}.${key} ${String(direction).toUpperCase()}`);
      }
    }

    if (clauses.length === 0) return '';

    return `ORDER BY ${clauses.join(', ')}`;
  }

  compileSelect<T>(select: SelectInput<T> | undefined, nodeAlias: string = 'n'): string {
    if (!select) return `${nodeAlias}`;

    const selectedFields = Object.entries(select)
      .filter(([, value]) => value === true)
      .map(([key]) => {
        assertIdentifier(key, 'property key');
        return `${nodeAlias}.${key} AS ${key}`;
      });

    if (selectedFields.length === 0) return `${nodeAlias}`;

    return selectedFields.join(', ');
  }

  compileFindMany<T extends Record<string, unknown>>(
    label: string,
    options: {
      where?: WhereCondition<T>;
      orderBy?: OrderByInput<T>;
      limit?: number;
      skip?: number;
      select?: SelectInput<T>;
    },
  ): CompiledQuery {
    this.reset();

    const alias = 'n';
    const whereClause = this.compileWhere(options.where, alias);
    const orderByClause = this.compileOrderBy(options.orderBy, alias);

    let cypher = `MATCH (${alias}:${label})`;

    if (whereClause.cypher) {
      cypher += ` WHERE ${whereClause.cypher}`;
    }

    cypher += ` RETURN ${this.compileSelect(options.select, alias)}`;

    if (orderByClause) {
      cypher += ` ${orderByClause}`;
    }

    if (typeof options.skip === 'number' && options.skip > 0) {
      cypher += ` SKIP ${options.skip}`;
    }

    if (typeof options.limit === 'number') {
      cypher += ` LIMIT ${options.limit}`;
    }

    return { cypher, params: whereClause.params };
  }

  compileFindUnique<T extends Record<string, unknown>>(
    label: string,
    where: NoInferShim<WhereCondition<T> & { id?: string }>,
    nodeConfig: AnyNodeConfig,
  ): CompiledQuery {
    this.reset();

    const alias = 'n';

    if (where.id) {
      const primaryKey = this.findPrimaryKey(nodeConfig);
      const key = primaryKey || 'id';
      const cypher = `MATCH (${alias}:${label} {${key}: $id}) RETURN ${alias}`;
      return { cypher, params: { id: where.id } };
    }

    const whereClause = this.compileWhere(where, alias);

    if (!whereClause.cypher) {
      return { cypher: '', params: {} };
    }

    const cypher = `MATCH (${alias}:${label}) WHERE ${whereClause.cypher} RETURN ${alias} LIMIT 1`;
    return { cypher, params: whereClause.params };
  }

  compileCreate<T extends Record<string, unknown>>(
    label: string,
    data: CreateInput<T>,
    _nodeConfig: AnyNodeConfig,
  ): CompiledQuery {
    this.reset();
    this.paramCounter = 0;

    const setClauses: string[] = [];
    const params: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(data)) {
      if (value === undefined) continue;
      const paramName = this.nextParam(key as string);
      setClauses.push(`${String(key)}: $${paramName}`);
      params[paramName] = value;
    }

    if (setClauses.length === 0) {
      const cypher = `CREATE (n:${label}) RETURN n`;
      return { cypher, params };
    }

    const propsString = `{ ${setClauses.join(', ')} }`;
    const cypher = `CREATE (n:${label} ${propsString}) RETURN n`;

    return { cypher, params };
  }

  compileCreateAndConnect<T extends Record<string, unknown>>(
    label: string,
    data: CreateInput<T>,
    relations: Record<string, { connect?: { where: Record<string, unknown> } | { id: string } }>,
    nodeConfig: AnyNodeConfig,
  ): CompiledQuery {
    this.reset();

    const queries: string[] = [];
    const params: Record<string, unknown> = {};
    const alias = 'n';

    const setClauses: string[] = [];
    for (const [key, value] of Object.entries(data)) {
      if (value === undefined) continue;
      const paramName = this.nextParam(key as string);
      setClauses.push(`${String(key)}: $${paramName}`);
      params[paramName] = value;
    }

    if (setClauses.length > 0) {
      const propsString = `{ ${setClauses.join(', ')} }`;
      queries.push(`CREATE (${alias}:${label} ${propsString})`);
    } else {
      queries.push(`CREATE (${alias}:${label})`);
    }

    let relIndex = 0;
    for (const [relName, relConfig] of Object.entries(relations)) {
      const nodeRel = nodeConfig.relations[relName] as RelationConfig<string, string> | undefined;
      if (!nodeRel || !relConfig.connect) continue;

      if ('id' in relConfig.connect) {
        const targetAlias = `target${relIndex}`;
        const relAlias = `r${relIndex}`;
        const paramName = this.nextParam('connectId');
        params[paramName] = relConfig.connect.id;

        if (nodeRel.direction === 'OUT') {
          queries.push(`MATCH (${targetAlias}:${nodeRel.target} {id: $${paramName}})`);
          queries.push(`CREATE (${alias})-[${relAlias}:${nodeRel.type}]->(${targetAlias})`);
        } else if (nodeRel.direction === 'IN') {
          queries.push(`MATCH (${targetAlias}:${nodeRel.target} {id: $${paramName}})`);
          queries.push(`CREATE (${targetAlias})-[${relAlias}:${nodeRel.type}]->(${alias})`);
        } else {
          queries.push(`MATCH (${targetAlias}:${nodeRel.target} {id: $${paramName}})`);
          queries.push(`CREATE (${alias})-[${relAlias}:${nodeRel.type}]-(${targetAlias})`);
        }
        relIndex++;
      } else if ('where' in relConfig.connect) {
        const targetAlias = `target${relIndex}`;
        const relAlias = `r${relIndex}`;
        const whereClause = this.compileWhere(
          relConfig.connect.where as WhereCondition<Record<string, unknown>>,
          targetAlias,
        );
        Object.assign(params, whereClause.params);

        if (whereClause.cypher) {
          queries.push(`MATCH (${targetAlias}:${nodeRel.target} WHERE ${whereClause.cypher})`);
        } else {
          queries.push(`MATCH (${targetAlias}:${nodeRel.target})`);
        }

        if (nodeRel.direction === 'OUT') {
          queries.push(`CREATE (${alias})-[${relAlias}:${nodeRel.type}]->(${targetAlias})`);
        } else if (nodeRel.direction === 'IN') {
          queries.push(`CREATE (${targetAlias})-[${relAlias}:${nodeRel.type}]->(${alias})`);
        } else {
          queries.push(`CREATE (${alias})-[${relAlias}:${nodeRel.type}]-(${targetAlias})`);
        }
        relIndex++;
      }
    }

    queries.push(`RETURN ${alias}`);

    return { cypher: queries.join('\n'), params };
  }

  compileUpdate<T extends Record<string, unknown>>(
    label: string,
    where: NoInferShim<WhereCondition<T> & { id?: string }>,
    data: UpdateInput<T>,
    nodeConfig: AnyNodeConfig,
  ): CompiledQuery {
    this.reset();

    const alias = 'n';

    let matchClause: string;
    const params: Record<string, unknown> = {};

    if (where.id) {
      const primaryKey = this.findPrimaryKey(nodeConfig);
      const key = primaryKey || 'id';
      matchClause = `MATCH (${alias}:${label} {${key}: $matchId})`;
      params['matchId'] = where.id;
    } else {
      const whereClause = this.compileWhere(where, alias);
      if (!whereClause.cypher) {
        return { cypher: '', params: {} };
      }
      matchClause = `MATCH (${alias}:${label}) WHERE ${whereClause.cypher}`;
      Object.assign(params, whereClause.params);
    }

    const setClauses: string[] = [];
    for (const [key, value] of Object.entries(data)) {
      if (value === undefined) continue;
      const paramName = this.nextParam(key as string);
      setClauses.push(`${alias}.${String(key)} = $${paramName}`);
      params[paramName] = value;
    }

    if (setClauses.length === 0) {
      return { cypher: `${matchClause} RETURN ${alias}`, params };
    }

    const cypher = `${matchClause}\nSET ${setClauses.join(', ')}\nRETURN ${alias}`;
    return { cypher, params };
  }

  compileDelete<T extends Record<string, unknown>>(
    label: string,
    where: NoInferShim<WhereCondition<T> & { id?: string }>,
    nodeConfig: AnyNodeConfig,
  ): CompiledQuery {
    this.reset();

    const alias = 'n';
    const params: Record<string, unknown> = {};

    let matchClause: string;

    if (where.id) {
      const primaryKey = this.findPrimaryKey(nodeConfig);
      const key = primaryKey || 'id';
      matchClause = `MATCH (${alias}:${label} {${key}: $matchId})`;
      params['matchId'] = where.id;
    } else {
      const whereClause = this.compileWhere(where, alias);
      if (!whereClause.cypher) {
        return { cypher: '', params: {} };
      }
      matchClause = `MATCH (${alias}:${label}) WHERE ${whereClause.cypher}`;
      Object.assign(params, whereClause.params);
    }

    const cypher = `${matchClause}\nDETACH DELETE ${alias}`;
    return { cypher, params };
  }

  compileInclude(
    include: IncludeInput | undefined,
    nodeAlias: string,
    nodeConfig: AnyNodeConfig,
  ): CompiledQuery[] {
    if (!include) return [];

    this.reset();
    const subQueries: CompiledQuery[] = [];

    for (const [relName, includeConfig] of Object.entries(include)) {
      if (!includeConfig) continue;

      const relConfig = nodeConfig.relations[relName] as RelationConfig<string, string> | undefined;
      if (!relConfig) continue;

      const targetAlias = `r_${relName}`;
      const relAlias = `rel_${relName}`;

      let matchClause: string;
      const targetPattern = `(${targetAlias}:${relConfig.target})`;
      if (relConfig.direction === 'IN') {
        matchClause = `OPTIONAL MATCH (${nodeAlias})<-[${relAlias}:${relConfig.type}]-${targetPattern}`;
      } else if (relConfig.direction === 'BOTH') {
        matchClause = `OPTIONAL MATCH (${nodeAlias})-[${relAlias}:${relConfig.type}]-${targetPattern}`;
      } else {
        matchClause = `OPTIONAL MATCH (${nodeAlias})-[${relAlias}:${relConfig.type}]->${targetPattern}`;
      }

      const returnStr = `RETURN ${targetAlias}`;

      subQueries.push({
        cypher: `${matchClause}\n${returnStr}`,
        params: {},
      });
    }

    return subQueries;
  }

  compileCreateRelation(
    from: RelationEndpoint,
    relationType: string,
    to: RelationEndpoint,
    direction: 'IN' | 'OUT' | 'BOTH' = 'OUT',
  ): CompiledQuery {
    assertIdentifier(relationType, 'relation type');
    const arrow = relationArrow(relationType, direction);
    return {
      cypher: `MATCH (a:${safeLabel(from)} {${safeKey(from)}: $fromId})\nMATCH (b:${safeLabel(to)} {${safeKey(to)}: $toId})\nCREATE (a)${arrow}(b)\nRETURN r`,
      params: { fromId: from.value, toId: to.value },
    };
  }

  compileDeleteRelation(
    from: RelationEndpoint,
    relationType: string,
    to: RelationEndpoint,
    direction: 'IN' | 'OUT' | 'BOTH' = 'OUT',
  ): CompiledQuery {
    assertIdentifier(relationType, 'relation type');
    const arrow = relationArrow(relationType, direction);
    return {
      cypher: `MATCH (a:${safeLabel(from)} {${safeKey(from)}: $fromId})${arrow}(b:${safeLabel(to)} {${safeKey(to)}: $toId})\nDELETE r`,
      params: { fromId: from.value, toId: to.value },
    };
  }

  compileUpsert<T extends Record<string, unknown>>(
    label: string,
    where: NoInferShim<WhereCondition<T> & { id?: string }>,
    create: CreateInput<T>,
    update: UpdateInput<T>,
    nodeConfig: AnyNodeConfig,
  ): CompiledQuery {
    this.reset();

    const alias = 'n';
    const params: Record<string, unknown> = {};
    const primaryKey = this.findPrimaryKey(nodeConfig) || 'id';

    // MERGE requires an equality pattern on the node's unique identity.
    let mergeValue: unknown;
    let hasMergeValue = false;

    const extractEq = (input: unknown): { value: unknown; ok: boolean } => {
      if (input === undefined || input === null) return { value: undefined, ok: false };
      if (
        typeof input === 'object' &&
        !(input instanceof Date) &&
        !Array.isArray(input) &&
        'eq' in (input as Record<string, unknown>)
      ) {
        return { value: (input as Record<string, unknown>)['eq'], ok: true };
      }
      if (typeof input === 'object' && !(input instanceof Date) && !Array.isArray(input)) {
        return { value: undefined, ok: false };
      }
      return { value: input, ok: true };
    };

    const idEq = extractEq(where.id);
    if (idEq.ok) {
      mergeValue = idEq.value;
      hasMergeValue = true;
    } else {
      const pkEq = extractEq((where as Record<string, unknown>)[primaryKey]);
      if (pkEq.ok) {
        mergeValue = pkEq.value;
        hasMergeValue = true;
      }
    }

    if (!hasMergeValue) {
      throw new Error(
        `compileUpsert requires an equality condition on the primary key "${primaryKey}" ` +
          `(e.g. { ${primaryKey}: 'value' } or { id: 'value' }), but received: ${JSON.stringify(where)}`,
      );
    }

    params['mergeKey'] = mergeValue;

    const createSetClauses: string[] = [];
    for (const [key, value] of Object.entries(create)) {
      if (value === undefined) continue;
      const pn = this.nextParam(`c_${key}`);
      createSetClauses.push(`${alias}.${String(key)} = $${pn}`);
      params[pn] = value;
    }

    const updateSetClauses: string[] = [];
    for (const [key, value] of Object.entries(update)) {
      if (value === undefined) continue;
      const pn = this.nextParam(`u_${key}`);
      updateSetClauses.push(`${alias}.${String(key)} = $${pn}`);
      params[pn] = value;
    }

    const cypher = `MERGE (${alias}:${label} {${primaryKey}: $mergeKey})
ON CREATE SET ${createSetClauses.join(', ') || `${alias}.createdAt = datetime()`}
ON MATCH SET ${updateSetClauses.join(', ') || `${alias}.updatedAt = datetime()`}
RETURN ${alias}`;

    return { cypher, params };
  }

  compileAggregate(
    label: string,
    aggregation: 'count' | 'sum' | 'avg' | 'min' | 'max',
    field?: string,
    where?: WhereCondition<Record<string, unknown>>,
  ): CompiledQuery {
    this.reset();

    const alias = 'n';
    const whereClause = this.compileWhere(where, alias);

    let matchClause = `MATCH (${alias}:${label})`;
    if (whereClause.cypher) {
      matchClause += ` WHERE ${whereClause.cypher}`;
    }

    let returnExpr: string;
    if (aggregation === 'count') {
      returnExpr = `COUNT(${alias})`;
    } else if (field) {
      returnExpr = `${aggregation.toUpperCase()}(${alias}.${field})`;
    } else {
      returnExpr = `COUNT(${alias})`;
    }

    const cypher = `${matchClause}\nRETURN ${returnExpr} AS result`;
    return { cypher, params: whereClause.params };
  }

  compileRaw(cypher: string, params?: Record<string, unknown>): CompiledQuery {
    return { cypher, params: params ?? {} };
  }

  compileCreateIndex(
    label: string,
    fields: string[],
    options: { unique?: boolean; name?: string } = {},
  ): CompiledQuery {
    const indexName = options.name ?? `idx_${label}_${fields.join('_')}`;
    const unique = options.unique ? 'UNIQUE' : '';
    const fieldsStr = fields.map((f) => `n.${f}`).join(', ');
    const cypher = `CREATE ${unique} INDEX ${indexName} IF NOT EXISTS FOR (n:${label}) ON (${fieldsStr})`;
    return { cypher, params: {} };
  }

  compileDropIndex(label: string, fields: string[], name?: string): CompiledQuery {
    const indexName = name ?? `idx_${label}_${fields.join('_')}`;
    const cypher = `DROP INDEX ${indexName} IF EXISTS`;
    return { cypher, params: {} };
  }

  compileCreateConstraint(
    label: string,
    fields: string[],
    type: 'UNIQUE' | 'EXISTS',
    name?: string,
  ): CompiledQuery {
    const constraintName = name ?? `constraint_${label}_${fields.join('_')}_${type.toLowerCase()}`;
    const fieldsStr = fields.map((f) => `n.${f}`).join(', ');
    const cypher = `CREATE CONSTRAINT ${constraintName} IF NOT EXISTS FOR (n:${label}) REQUIRE (${fieldsStr}) IS ${type}`;
    return { cypher, params: {} };
  }

  compileDropConstraint(_label: string, name: string): CompiledQuery {
    const cypher = `DROP CONSTRAINT ${name} IF EXISTS`;
    return { cypher, params: {} };
  }

  compileCreateNodeLabel(label: string): CompiledQuery {
    // In Neo4j, labels are created implicitly when nodes are created
    // This is a no-op but kept for migration symmetry
    return { cypher: `// Label ${label} created implicitly`, params: {} };
  }

  compileDropNodeLabel(label: string): CompiledQuery {
    // Remove all nodes with this label
    const cypher = `MATCH (n:${label}) DETACH DELETE n`;
    return { cypher, params: {} };
  }

  compileAddProperty(label: string, propertyName: string, defaultValue?: unknown): CompiledQuery {
    const cypher = `MATCH (n:${label}) SET n.${propertyName} = $defaultValue`;
    const params: Record<string, unknown> = { defaultValue: defaultValue ?? null };
    return { cypher, params };
  }

  compileDropProperty(label: string, propertyName: string): CompiledQuery {
    const cypher = `MATCH (n:${label}) REMOVE n.${propertyName}`;
    return { cypher, params: {} };
  }

  compileCreateRelationType(
    _fromLabel: string,
    relationType: string,
    _toLabel: string,
    _direction: 'IN' | 'OUT' = 'OUT',
  ): CompiledQuery {
    // Relation types are created implicitly in Neo4j
    return { cypher: `// Relation type ${relationType} created implicitly`, params: {} };
  }

  compileDropRelationType(relationType: string): CompiledQuery {
    // Remove all relationships of this type
    const cypher = `MATCH ()-[r:${relationType}]-() DELETE r`;
    return { cypher, params: {} };
  }

  /**
   * Compile a variable-length path traversal query
   * (n)-[:REL*min..max]->(m)
   */
  compilePath(
    fromLabel: string,
    relationType: string,
    toLabel: string,
    options: {
      fromId?: string;
      fromWhere?: WhereCondition<Record<string, unknown>>;
      minDepth?: number;
      maxDepth?: number;
      direction?: 'IN' | 'OUT' | 'BOTH';
      limit?: number;
      orderBy?: 'asc' | 'desc';
    },
  ): CompiledQuery {
    this.reset();

    const fromAlias = 'n';
    const toAlias = 'm';
    const params: Record<string, unknown> = {};

    let fromClause: string;
    if (options.fromId) {
      fromClause = `MATCH (${fromAlias}:${fromLabel} {id: $fromId})`;
      params['fromId'] = options.fromId;
    } else if (options.fromWhere) {
      const whereClause = this.compileWhere(options.fromWhere, fromAlias);
      fromClause = `MATCH (${fromAlias}:${fromLabel})`;
      if (whereClause.cypher) {
        fromClause += ` WHERE ${whereClause.cypher}`;
      }
      Object.assign(params, whereClause.params);
    } else {
      fromClause = `MATCH (${fromAlias}:${fromLabel})`;
    }

    const minDepth = options.minDepth ?? 1;
    const maxDepth = options.maxDepth ?? 3;
    const depthSpec = minDepth === maxDepth ? `${minDepth}` : `${minDepth}..${maxDepth}`;

    let pathPattern: string;
    const dir = options.direction ?? 'OUT';
    if (dir === 'OUT') {
      pathPattern = `(${fromAlias})-[:${relationType}*${depthSpec}]->(${toAlias}:${toLabel})`;
    } else if (dir === 'IN') {
      pathPattern = `(${fromAlias})<-[:${relationType}*${depthSpec}]-(${toAlias}:${toLabel})`;
    } else {
      pathPattern = `(${fromAlias})-[:${relationType}*${depthSpec}]-(${toAlias}:${toLabel})`;
    }

    let cypher = `${fromClause}\nMATCH ${pathPattern}\nRETURN ${toAlias}`;

    if (options.orderBy) {
      cypher += ` ORDER BY ${toAlias}.id ${options.orderBy.toUpperCase()}`;
    }

    if (options.limit) {
      cypher += ` LIMIT ${options.limit}`;
    }

    return { cypher, params };
  }

  /**
   * Compile a shortest path query
   * shortestPath((n)-[:REL*]->(m))
   */
  compileShortestPath(
    fromLabel: string,
    relationType: string,
    toLabel: string,
    options: {
      fromId?: string;
      fromWhere?: WhereCondition<Record<string, unknown>>;
      toId?: string;
      toWhere?: WhereCondition<Record<string, unknown>>;
      maxDepth?: number;
      direction?: 'IN' | 'OUT' | 'BOTH';
    },
  ): CompiledQuery {
    this.reset();

    const fromAlias = 'n';
    const toAlias = 'm';
    const params: Record<string, unknown> = {};

    let fromClause: string;
    if (options.fromId) {
      fromClause = `MATCH (${fromAlias}:${fromLabel} {id: $fromId})`;
      params['fromId'] = options.fromId;
    } else if (options.fromWhere) {
      const whereClause = this.compileWhere(options.fromWhere, fromAlias);
      fromClause = `MATCH (${fromAlias}:${fromLabel})`;
      if (whereClause.cypher) {
        fromClause += ` WHERE ${whereClause.cypher}`;
      }
      Object.assign(params, whereClause.params);
    } else {
      fromClause = `MATCH (${fromAlias}:${fromLabel})`;
    }

    let toClause: string;
    if (options.toId) {
      toClause = `MATCH (${toAlias}:${toLabel} {id: $toId})`;
      params['toId'] = options.toId;
    } else if (options.toWhere) {
      const whereClause = this.compileWhere(options.toWhere, toAlias);
      toClause = `MATCH (${toAlias}:${toLabel})`;
      if (whereClause.cypher) {
        toClause += ` WHERE ${whereClause.cypher}`;
      }
      Object.assign(params, whereClause.params);
    } else {
      toClause = `MATCH (${toAlias}:${toLabel})`;
    }

    const maxDepth = options.maxDepth ?? 15;
    const dir = options.direction ?? 'OUT';
    let pathPattern: string;
    if (dir === 'OUT') {
      pathPattern = `shortestPath((${fromAlias})-[:${relationType}*1..${maxDepth}]->(${toAlias}))`;
    } else if (dir === 'IN') {
      pathPattern = `shortestPath((${fromAlias})<-[:${relationType}*1..${maxDepth}]-(${toAlias}))`;
    } else {
      pathPattern = `shortestPath((${fromAlias})-[:${relationType}*1..${maxDepth}]-(${toAlias}))`;
    }

    const cypher = `${fromClause}\n${toClause}\nMATCH ${pathPattern}\nRETURN ${fromAlias}, ${toAlias}, ${pathPattern} AS path`;

    return { cypher, params };
  }

  /**
   * Compile all shortest paths query
   * allShortestPaths((n)-[:REL*]->(m))
   */
  compileAllShortestPaths(
    fromLabel: string,
    relationType: string,
    toLabel: string,
    options: {
      fromId?: string;
      fromWhere?: WhereCondition<Record<string, unknown>>;
      toId?: string;
      toWhere?: WhereCondition<Record<string, unknown>>;
      maxDepth?: number;
      direction?: 'IN' | 'OUT' | 'BOTH';
    },
  ): CompiledQuery {
    this.reset();

    const fromAlias = 'n';
    const toAlias = 'm';
    const params: Record<string, unknown> = {};

    let fromClause: string;
    if (options.fromId) {
      fromClause = `MATCH (${fromAlias}:${fromLabel} {id: $fromId})`;
      params['fromId'] = options.fromId;
    } else if (options.fromWhere) {
      const whereClause = this.compileWhere(options.fromWhere, fromAlias);
      fromClause = `MATCH (${fromAlias}:${fromLabel})`;
      if (whereClause.cypher) {
        fromClause += ` WHERE ${whereClause.cypher}`;
      }
      Object.assign(params, whereClause.params);
    } else {
      fromClause = `MATCH (${fromAlias}:${fromLabel})`;
    }

    let toClause: string;
    if (options.toId) {
      toClause = `MATCH (${toAlias}:${toLabel} {id: $toId})`;
      params['toId'] = options.toId;
    } else if (options.toWhere) {
      const whereClause = this.compileWhere(options.toWhere, toAlias);
      toClause = `MATCH (${toAlias}:${toLabel})`;
      if (whereClause.cypher) {
        toClause += ` WHERE ${whereClause.cypher}`;
      }
      Object.assign(params, whereClause.params);
    } else {
      toClause = `MATCH (${toAlias}:${toLabel})`;
    }

    const maxDepth = options.maxDepth ?? 15;
    const dir = options.direction ?? 'OUT';
    let pathPattern: string;
    if (dir === 'OUT') {
      pathPattern = `allShortestPaths((${fromAlias})-[:${relationType}*1..${maxDepth}]->(${toAlias}))`;
    } else if (dir === 'IN') {
      pathPattern = `allShortestPaths((${fromAlias})<-[:${relationType}*1..${maxDepth}]-(${toAlias}))`;
    } else {
      pathPattern = `allShortestPaths((${fromAlias})-[:${relationType}*1..${maxDepth}]-(${toAlias}))`;
    }

    const cypher = `${fromClause}\n${toClause}\nMATCH ${pathPattern}\nRETURN ${fromAlias}, ${toAlias}, ${pathPattern} AS path`;

    return { cypher, params };
  }

  private findPrimaryKey(nodeConfig: AnyNodeConfig): string | null {
    for (const [key, prop] of Object.entries(nodeConfig.properties)) {
      const config = prop as PropertyConfig;
      if (config.primary) {
        return key;
      }
    }
    return null;
  }
}

export function createQueryCompiler(): QueryCompiler {
  return new QueryCompiler();
}
