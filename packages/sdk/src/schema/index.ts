// @graph-om/sdk/src/schema/index.ts
// Schema definition API - Drizzle-style fluent API

import type {
  InferNodeProperties,
  InferNodeRelations,
  NodeConfig,
  PropertyConfig,
  PropertyType,
  RelationConfig,
  RelationDirection,
} from '../types';

export interface NodeBuilder<
  TName extends string,
  TProps extends Record<string, PropertyConfig>,
  TRels extends Record<string, RelationConfig<any, any>>,
> {
  label: TName;
  properties: TProps;
  relations: TRels;
  indexes: Array<{ fields: Array<keyof TProps>; unique?: boolean }>;
  constraints: Array<{ fields: Array<keyof TProps>; type: 'UNIQUE' | 'EXISTS' }>;

  add<K extends string, T extends PropertyConfig>(
    key: K,
    config: T,
  ): NodeBuilder<TName, TProps & Record<K, T>, TRels>;

  add<K extends string, TFrom extends string, TTo extends string>(
    key: K,
    config: RelationConfig<TFrom, TTo>,
  ): NodeBuilder<TName, TProps, TRels & Record<K, RelationConfig<TFrom, TTo>>>;

  index(fields: Array<keyof TProps>, unique?: boolean): this;
  constraint(fields: Array<keyof TProps>, type: 'UNIQUE' | 'EXISTS'): this;

  build(): NodeConfig<TName, TProps>;
}

function createNodeBuilder<
  TName extends string,
  TProps extends Record<string, PropertyConfig>,
  TRels extends Record<string, RelationConfig<any, any>>,
>(
  label: TName,
  initialProps: TProps,
  initialRels: TRels,
  indexes: NodeConfig<any, any>['indexes'] = [],
  constraints: NodeConfig<any, any>['constraints'] = [],
): NodeBuilder<TName, TProps, TRels> {
  const builder: NodeBuilder<TName, TProps, TRels> = {
    label,
    properties: initialProps,
    relations: initialRels,
    indexes: indexes as NonNullable<NodeConfig<TName, TProps>['indexes']>,
    constraints: constraints as NonNullable<NodeConfig<TName, TProps>['constraints']>,

    add<K extends string>(key: K, config: PropertyConfig | RelationConfig<any, any>): any {
      if ('direction' in config && 'target' in config) {
        return createNodeBuilder(
          label,
          initialProps,
          { ...initialRels, [key]: config } as TRels & Record<K, RelationConfig<string, string>>,
          indexes,
          constraints,
        );
      }
      return createNodeBuilder(
        label,
        { ...initialProps, [key]: config } as TProps & Record<K, PropertyConfig>,
        initialRels,
        indexes,
        constraints,
      );
    },

    index(fields: Array<keyof TProps>, unique = false) {
      return createNodeBuilder(
        label,
        initialProps,
        initialRels,
        [...indexes, { fields, unique }] as NonNullable<NodeConfig<TName, TProps>['indexes']>,
        constraints,
      );
    },

    constraint(fields: Array<keyof TProps>, type: 'UNIQUE' | 'EXISTS') {
      return createNodeBuilder(label, initialProps, initialRels, indexes, [
        ...constraints,
        { fields, type },
      ] as NonNullable<NodeConfig<TName, TProps>['constraints']>);
    },

    build() {
      return {
        label,
        properties: initialProps,
        relations: initialRels,
        indexes: indexes as NonNullable<NodeConfig<TName, TProps>['indexes']>,
        constraints: constraints as NonNullable<NodeConfig<TName, TProps>['constraints']>,
      } as NodeConfig<TName, TProps>;
    },
  };

  return builder;
}

export function node<TName extends string>(label: TName) {
  return createNodeBuilder<TName, Record<string, never>, Record<string, never>>(label, {}, {});
}

export function property<T extends PropertyType>(
  type: T,
  config?: Omit<PropertyConfig<T>, 'type'>,
): PropertyConfig<T> {
  return { type, ...config } as PropertyConfig<T>;
}

export function string(config?: Omit<PropertyConfig<'string'>, 'type'>) {
  return property('string', config);
}

export function number(config?: Omit<PropertyConfig<'number'>, 'type'>) {
  return property('number', config);
}

export function boolean(config?: Omit<PropertyConfig<'boolean'>, 'type'>) {
  return property('boolean', config);
}

export function date(config?: Omit<PropertyConfig<'date'>, 'type'>) {
  return property('date', config);
}

export function bigint(config?: Omit<PropertyConfig<'bigint'>, 'type'>) {
  return property('bigint', config);
}

export function float(config?: Omit<PropertyConfig<'float'>, 'type'>) {
  return property('float', config);
}

export function uuid(config?: Omit<PropertyConfig<'uuid'>, 'type'>) {
  return property('uuid', config);
}

export function json(config?: Omit<PropertyConfig<'json'>, 'type'>) {
  return property('json', config);
}

export function relation<TFrom extends string, TTo extends string>(
  type: string,
  direction: RelationDirection,
  target: TTo,
  config?: {
    properties?: Record<string, PropertyConfig>;
    multiple?: boolean;
  },
): RelationConfig<TFrom, TTo> {
  return {
    type,
    direction,
    target,
    properties: config?.properties,
    multiple: config?.multiple ?? false,
  };
}

/**
 * Path traversal helpers for variable-length paths and graph algorithms
 */
export interface PathConfig {
  minDepth?: number;
  maxDepth?: number;
  relationshipFilter?: string;
  direction?: 'OUT' | 'IN' | 'BOTH';
}

/**
 * Variable-length path: (n)-[:REL*min..max]->(m)
 */
export function path<TFrom extends string, TTo extends string>(
  type: string,
  direction: RelationDirection,
  target: TTo,
  config?: PathConfig,
): RelationConfig<TFrom, TTo> & { path?: PathConfig } {
  return {
    type,
    direction,
    target,
    multiple: true,
    path: config,
  };
}

/**
 * Shortest path: shortestPath((n)-[:REL*]->(m))
 */
export function shortestPath<TFrom extends string, TTo extends string>(
  type: string,
  direction: RelationDirection,
  target: TTo,
  config?: PathConfig,
): RelationConfig<TFrom, TTo> & { _shortestPath?: true } {
  return {
    type,
    direction,
    target,
    multiple: true,
    _shortestPath: true,
    path: config,
  };
}

/**
 * All shortest paths: allShortestPaths((n)-[:REL*]->(m))
 */
export function allShortestPaths<TFrom extends string, TTo extends string>(
  type: string,
  direction: RelationDirection,
  target: TTo,
  config?: PathConfig,
): RelationConfig<TFrom, TTo> & { _allShortestPaths?: true } {
  return {
    type,
    direction,
    target,
    multiple: true,
    _allShortestPaths: true,
    path: config,
  };
}

export function defineRel<TFrom extends string, TTo extends string>(
  type: string,
  direction: RelationDirection,
  target: TTo,
  config?: {
    properties?: Record<string, PropertyConfig>;
    multiple?: boolean;
  },
): RelationConfig<TFrom, TTo> {
  return relation(type, direction, target, config);
}

export interface SchemaBuilder<TNodes extends Record<string, NodeConfig<any, any>>> {
  nodes: TNodes;

  add<TName extends string, TProps extends Record<string, PropertyConfig>>(
    name: TName,
    node: NodeConfig<TName, TProps>,
  ): SchemaBuilder<TNodes & Record<TName, NodeConfig<TName, TProps>>>;

  build(): TNodes;
}

function createSchemaBuilder<TNodes extends Record<string, NodeConfig<any, any>>>(
  nodes: TNodes = {} as TNodes,
): SchemaBuilder<TNodes> {
  return {
    nodes,

    add<TName extends string, TProps extends Record<string, PropertyConfig>>(
      name: TName,
      node: NodeConfig<TName, TProps>,
    ) {
      return createSchemaBuilder({
        ...nodes,
        [name]: node,
      } as TNodes & Record<TName, NodeConfig<TName, TProps>>);
    },

    build() {
      return nodes;
    },
  };
}

export function schema() {
  return createSchemaBuilder();
}

export type InferSchemaNodes<T extends ReturnType<typeof schema>> =
  T extends SchemaBuilder<infer U> ? U : never;

export type InferNodeFromSchema<
  T extends ReturnType<typeof schema>,
  TName extends keyof InferSchemaNodes<T>,
> = InferNodeProperties<InferSchemaNodes<T>[TName]> &
  InferNodeRelations<InferSchemaNodes<T>[TName]>;

export type SchemaNodeNames<T extends ReturnType<typeof schema>> = keyof InferSchemaNodes<T>;

export {
  type ParsedNode,
  type ParseError,
  type ParseResult,
  parseSchemaFile,
  parseSchemaFromSource,
} from './parser';
