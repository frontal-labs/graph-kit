// @graph-om/sdk/src/graphql/index.ts
// GraphQL layer for Graph-OM - generates GraphQL schema from Graph-OM schema

import { errorResponse, raiseGraphError, toPublic } from '../errors';
import type { GraphSchemaRegistry, NodeConfig, PropertyConfig } from '../types';

export interface GraphQLSchemaConfig {
  schema: GraphSchemaRegistry;
  queryTypeName?: string;
  mutationTypeName?: string;
  includeRelations?: boolean;
  includeAggregations?: boolean;
  customScalars?: Record<string, GraphQLScalarConfig>;
  directives?: GraphQLDirectiveConfig[];
}

export interface GraphQLScalarConfig {
  name: string;
  description?: string;
  serialize: (value: unknown) => unknown;
  parseValue: (value: unknown) => unknown;
  parseLiteral: (ast: unknown) => unknown;
}

export interface GraphQLDirectiveConfig {
  name: string;
  locations: string[];
  args?: Record<string, { type: string; description?: string }>;
  description?: string;
}

export interface GraphQLTypeMap {
  [typeName: string]: GraphQLObjectType;
}

export interface GraphQLObjectType {
  name: string;
  description?: string;
  fields: GraphQLFieldMap;
  interfaces?: string[];
}

export interface GraphQLFieldMap {
  [fieldName: string]: GraphQLField;
}

export interface GraphQLField {
  type: string;
  description?: string;
  args?: GraphQLArgsMap;
  resolve?: (source: unknown, args: Record<string, unknown>) => unknown;
  deprecationReason?: string;
}

export interface GraphQLArgsMap {
  [argName: string]: GraphQLArg;
}

export interface GraphQLArg {
  type: string;
  description?: string;
  defaultValue?: unknown;
}

export function generateGraphQLSchema(config: GraphQLSchemaConfig): string {
  const { schema, queryTypeName = 'Query', mutationTypeName = 'Mutation' } = config;
  const types: string[] = [];
  const queryFields: string[] = [];
  const mutationFields: string[] = [];

  // Generate scalars
  if (config.customScalars) {
    for (const [name, _scalar] of Object.entries(config.customScalars)) {
      types.push(`scalar ${name}`);
    }
  }

  // Generate directives
  if (config.directives) {
    for (const directive of config.directives) {
      const args = directive.args
        ? `(${Object.entries(directive.args)
            .map(([k, v]) => `${k}: ${v.type}`)
            .join(', ')})`
        : '';
      types.push(`directive @${directive.name}${args} on ${directive.locations.join(' | ')}`);
    }
  }

  // Generate node types
  for (const [label, nodeConfig] of Object.entries(schema) as [
    string,
    NodeConfig<string, Record<string, PropertyConfig>>,
  ][]) {
    const typeName = label;
    const fields = generateNodeFields(nodeConfig, config.includeRelations);
    types.push(`type ${typeName} {\n  ${fields.join('\n  ')}\n}`);
  }

  // Generate input types
  for (const [label, nodeConfig] of Object.entries(schema) as [
    string,
    NodeConfig<string, Record<string, PropertyConfig>>,
  ][]) {
    const createInput = generateCreateInputType(label, nodeConfig);
    const updateInput = generateUpdateInputType(label, nodeConfig);
    const whereInput = generateWhereInputType(label, nodeConfig);

    types.push(createInput);
    types.push(updateInput);
    types.push(whereInput);
  }

  // Generate query fields
  for (const [label, _nodeConfig] of Object.entries(schema) as [
    string,
    NodeConfig<string, Record<string, PropertyConfig>>,
  ][]) {
    const plural = pluralize(label.toLowerCase());
    const singular = label.toLowerCase();

    // findMany
    queryFields.push(
      `${plural}(where: ${label}Where, orderBy: [${label}OrderBy], limit: Int, skip: Int): [${label}!]!`,
    );

    // findUnique
    queryFields.push(`${singular}(where: ${label}WhereUnique!): ${label}`);

    // count
    queryFields.push(`${plural}Count(where: ${label}Where): Int!`);

    // aggregate
    if (config.includeAggregations) {
      queryFields.push(`${plural}Aggregate(where: ${label}Where): ${label}Aggregate!`);
    }
  }

  // Generate mutation fields
  for (const [label, _nodeConfig] of Object.entries(schema)) {
    const _singular = label.toLowerCase();

    mutationFields.push(`create${label}(data: ${label}CreateInput!): ${label}!`);
    mutationFields.push(
      `update${label}(where: ${label}WhereUnique!, data: ${label}UpdateInput!): ${label}!`,
    );
    mutationFields.push(`delete${label}(where: ${label}WhereUnique!): ${label}!`);
    mutationFields.push(
      `upsert${label}(where: ${label}WhereUnique!, create: ${label}CreateInput!, update: ${label}UpdateInput!): ${label}!`,
    );
  }

  // Add query and mutation types
  types.push(`type ${queryTypeName} {\n  ${queryFields.join('\n  ')}\n}`);
  types.push(`type ${mutationTypeName} {\n  ${mutationFields.join('\n  ')}\n}`);

  return types.join('\n\n');
}

function generateNodeFields(
  nodeConfig: NodeConfig<string, Record<string, PropertyConfig>>,
  includeRelations = true,
): string[] {
  const fields: string[] = [];

  for (const [propName, propConfig] of Object.entries(
    nodeConfig.properties as Record<string, PropertyConfig>,
  )) {
    const graphqlType = propertyToGraphQLType(propConfig);
    const nullable = propConfig.nullable ? '' : '!';
    fields.push(`${propName}: ${graphqlType}${nullable}`);
  }

  if (includeRelations) {
    for (const [relName, relConfig] of Object.entries(nodeConfig.relations)) {
      const targetType = relConfig.target;
      const isArray = relConfig.multiple;
      const nullable = relConfig.multiple ? '!' : '';
      const arrayWrapper = isArray ? '[' : '';
      const arrayClose = isArray ? ']!' : '';
      fields.push(`${relName}: ${arrayWrapper}${targetType}${arrayClose}${nullable}`);
    }
  }

  return fields;
}

function propertyToGraphQLType(propConfig: PropertyConfig): string {
  switch (propConfig.type) {
    case 'string':
      return 'String';
    case 'number':
    case 'float':
      return 'Float';
    case 'boolean':
      return 'Boolean';
    case 'bigint':
      return 'BigInt';
    case 'date':
      return 'DateTime';
    case 'uuid':
      return 'ID';
    case 'json':
      return 'JSON';
    default:
      return 'String';
  }
}

function generateCreateInputType(
  label: string,
  nodeConfig: NodeConfig<string, Record<string, PropertyConfig>>,
): string {
  const fields: string[] = [];

  for (const [propName, propConfig] of Object.entries(
    nodeConfig.properties as Record<string, PropertyConfig>,
  )) {
    if (propConfig.primary) continue;
    if (propConfig.array) continue;

    const graphqlType = propertyToGraphQLType(propConfig);
    const nullable = propConfig.nullable ? '' : '!';
    fields.push(`${propName}: ${graphqlType}${nullable}`);
  }

  return `input ${label}CreateInput {\n  ${fields.join('\n  ')}\n}`;
}

function generateUpdateInputType(
  label: string,
  nodeConfig: NodeConfig<string, Record<string, PropertyConfig>>,
): string {
  const fields: string[] = [];

  for (const [propName, propConfig] of Object.entries(
    nodeConfig.properties as Record<string, PropertyConfig>,
  )) {
    if (propConfig.primary) continue;

    const graphqlType = propertyToGraphQLType(propConfig);
    fields.push(`${propName}: ${graphqlType}`);
  }

  return `input ${label}UpdateInput {\n  ${fields.join('\n  ')}\n}`;
}

function generateWhereInputType(
  label: string,
  nodeConfig: NodeConfig<string, Record<string, PropertyConfig>>,
): string {
  const fields: string[] = [];

  for (const [propName, propConfig] of Object.entries(
    nodeConfig.properties as Record<string, PropertyConfig>,
  )) {
    const _graphqlType = propertyToGraphQLType(propConfig);
    const arrayWrapper = propConfig.array ? '[' : '';
    const arrayClose = propConfig.array ? ']' : '';
    fields.push(`${propName}: ${arrayWrapper}${label}WhereOperator${arrayClose}`);
  }

  fields.push(`AND: [${label}Where!]`);
  fields.push(`OR: [${label}Where!]`);
  fields.push(`NOT: ${label}Where`);

  return `input ${label}Where {\n  ${fields.join('\n  ')}\n}`;
}

function pluralize(word: string): string {
  if (word.endsWith('y')) return `${word.slice(0, -1)}ies`;
  if (word.endsWith('s') || word.endsWith('x') || word.endsWith('z')) return `${word}es`;
  if (word.endsWith('ch') || word.endsWith('sh')) return `${word}es`;
  return `${word}s`;
}

// GraphQL scalar definitions
export const DateTimeScalar: GraphQLScalarConfig = {
  name: 'DateTime',
  description: 'ISO 8601 date-time string',
  serialize: (value: unknown) => {
    if (value instanceof Date) return value.toISOString();
    return String(value);
  },
  parseValue: (value: unknown) => {
    if (typeof value === 'string') return new Date(value);
    if (value instanceof Date) return value;
    raiseGraphError('DateTime must be a string or Date', {
      code: 'invalid_argument',
      statusCode: 400,
    });
  },
  parseLiteral: (ast: unknown) => {
    // Simplified - in real implementation would parse GraphQL AST
    return new Date(String(ast));
  },
};

export const JSONScalar: GraphQLScalarConfig = {
  name: 'JSON',
  description: 'Arbitrary JSON value',
  serialize: (value: unknown) => value,
  parseValue: (value: unknown) => value,
  parseLiteral: (ast: unknown) => ast,
};

export const BigIntScalar: GraphQLScalarConfig = {
  name: 'BigInt',
  description: '64-bit signed integer',
  serialize: (value: unknown) => String(value),
  parseValue: (value: unknown) => BigInt(String(value)),
  parseLiteral: (ast: unknown) => BigInt(String(ast)),
};

// Generate GraphQL resolvers from Metal schema
export interface GraphQLResolversConfig {
  schema: GraphSchemaRegistry;
  client: unknown; // GraphClient instance
}

export function generateResolvers(config: GraphQLResolversConfig): Record<string, unknown> {
  const { schema, client } = config;
  const query: Record<string, unknown> = {};
  const mutation: Record<string, unknown> = {};
  const nodeResolvers: Record<string, Record<string, unknown>> = {};

  // We can't actually generate executable resolvers without the client instance
  // This returns the structure that would be used

  for (const label of Object.keys(schema)) {
    const plural = pluralize(label.toLowerCase());
    const singular = label.toLowerCase();

    query[plural] = async (
      _: unknown,
      args: { where?: unknown; orderBy?: unknown; limit?: number; skip?: number },
    ) => {
      // @ts-expect-error - client would be typed
      return client.findMany(label, {
        where: args.where,
        orderBy: args.orderBy,
        limit: args.limit,
        skip: args.skip,
      });
    };

    query[singular] = async (_: unknown, args: { where: unknown }) => {
      // @ts-expect-error
      return client.findUnique(label, { where: args.where });
    };

    query[`${plural}Count`] = async (_: unknown, args: { where?: unknown }) => {
      // @ts-expect-error
      return client.count(label, args.where);
    };

    mutation[`create${label}`] = async (_: unknown, args: { data: unknown }) => {
      // @ts-expect-error
      return client.create(label, { data: args.data });
    };

    mutation[`update${label}`] = async (_: unknown, args: { where: unknown; data: unknown }) => {
      // @ts-expect-error
      return client.update(label, { where: args.where, data: args.data });
    };

    mutation[`delete${label}`] = async (_: unknown, args: { where: unknown }) => {
      // @ts-expect-error
      await client.delete(label, { where: args.where });
      return { success: true };
    };

    mutation[`upsert${label}`] = async (
      _: unknown,
      args: { where: unknown; create: unknown; update: unknown },
    ) => {
      // @ts-expect-error
      return client.upsert(label, { where: args.where, create: args.create, update: args.update });
    };
  }

  // Relation resolvers
  for (const [label, nodeConfig] of Object.entries(
    schema as Record<string, NodeConfig<string, Record<string, PropertyConfig>>>,
  )) {
    nodeResolvers[label] = {};
    for (const [relName, relConfig] of Object.entries(nodeConfig.relations)) {
      nodeResolvers[label][relName] = async (parent: Record<string, unknown>) => {
        // @ts-expect-error
        const result = await client.findMany(relConfig.target, {
          where: { id: { in: parent[relName] } },
        });
        return relConfig.multiple ? result : result[0] || null;
      };
    }
  }

  return {
    Query: wrapResolvers(query),
    Mutation: wrapResolvers(mutation),
    ...Object.fromEntries(
      Object.entries(nodeResolvers).map(([label, resolvers]) => [label, wrapResolvers(resolvers)]),
    ),
  };
}

type Resolver = (...args: unknown[]) => Promise<unknown>;

/**
 * Turn any thrown error into one a GraphQL server can send: the public message
 * as `message`, and the client-safe error object as `extensions` (graphql-js
 * copies `extensions` from the thrown error onto the GraphQLError).
 */
export function toGraphQLError(error: unknown): Error {
  const publicError = toPublic(error);
  const { error: clientError } = JSON.parse(errorResponse(publicError).body) as {
    error: Record<string, unknown>;
  };
  return Object.assign(publicError, { extensions: clientError });
}

function wrapResolvers(resolvers: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(resolvers).map(([name, fn]) => [
      name,
      async (...args: unknown[]) => {
        try {
          return await (fn as Resolver)(...args);
        } catch (error) {
          throw toGraphQLError(error);
        }
      },
    ]),
  );
}

// Integration with popular GraphQL servers
export interface ApolloServerConfig {
  schema: string;
  resolvers: Record<string, unknown>;
  context?: (request: unknown) => Promise<Record<string, unknown>>;
  plugins?: unknown[];
}

export function createApolloServerConfig(_config: ApolloServerConfig): unknown {
  raiseGraphError(
    'createApolloServerConfig() is not implemented. Pass generateGraphQLSchema() and generateResolvers() to your Apollo Server instance directly.',
    { code: 'unsupported_option', statusCode: 400 },
  );
}

export interface GraphQLYogaConfig {
  schema: string;
  resolvers: Record<string, unknown>;
  graphqlEndpoint?: string;
}

export function createGraphQLYogaConfig(_config: GraphQLYogaConfig): unknown {
  raiseGraphError(
    'createGraphQLYogaConfig() is not implemented. Pass generateGraphQLSchema() and generateResolvers() to your Yoga server directly.',
    { code: 'unsupported_option', statusCode: 400 },
  );
}
