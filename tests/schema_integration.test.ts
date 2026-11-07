// @graph-om/tests/schema_integration.test.ts
// Cross-package test: validates @graph-om/sdk schema DSL works with @graph-om/neo4j types

import type { DriverAdapter, GraphSchemaRegistry, NodeConfig } from '@graph-om/sdk';
import { boolean, date, defineRel, node, number, schema, string } from '@graph-om/sdk';
import { describe, expect, it } from 'vitest';

describe('schema DSL + neo4j-driver integration', () => {
  it('builds a valid NodeConfig with primary key', () => {
    const User = node('User')
      .add('id', string({ primary: true }))
      .add('name', string())
      .add('age', number())
      .add('active', boolean())
      .add('createdAt', date({ default: () => new Date() }))
      .build();

    expect(User.label).toBe('User');
    expect(User.properties.id.type).toBe('string');
    expect(User.properties.id.primary).toBe(true);
    expect(User.properties.name.type).toBe('string');
    expect(User.properties.age.type).toBe('number');
    expect(User.properties.active.type).toBe('boolean');
    expect(User.properties.createdAt.type).toBe('date');
  });

  it('builds relationships with defineRel', () => {
    const AUTHORS = defineRel('AUTHORS', 'OUT', 'Post', {
      properties: { createdAt: date({ default: () => new Date() }) },
    });

    expect(AUTHORS.type).toBe('AUTHORS');
    expect(AUTHORS.direction).toBe('OUT');
    expect(AUTHORS.target).toBe('Post');
    expect(AUTHORS.properties?.createdAt.type).toBe('date');
  });

  it('builds a schema registry', () => {
    const User = node('User')
      .add('id', string({ primary: true }))
      .add('name', string())
      .build();

    const Post = node('Post')
      .add('id', string({ primary: true }))
      .add('title', string())
      .build();

    const graph = schema().add('User', User).add('Post', Post).build();

    expect(graph).toHaveProperty('User');
    expect(graph).toHaveProperty('Post');
    expect((graph as GraphSchemaRegistry).User.label).toBe('User');
    expect((graph as GraphSchemaRegistry).Post.label).toBe('Post');
  });

  it('DriverAdapter interface is satisfied by createNeo4jDriver type', () => {
    // Type-level test: DriverAdapter methods exist
    const adapter: DriverAdapter = {
      connect: async () => {},
      disconnect: async () => {},
      runQuery: async () => ({
        records: [],
        summary: {
          query: { text: '', parameters: {} },
          counters: {},
          notifications: [],
          database: { name: 'neo4j' },
        },
        keys: [],
      }),
      runInTransaction: async (work) => work({} as any),
      runInReadTransaction: async (work) => work({} as any),
      verifyConnectivity: async () => true,
      getServerInfo: async () => ({
        address: 'localhost:7687',
        version: '5.0',
        protocol: 'bolt',
      }),
    };

    expect(typeof adapter.connect).toBe('function');
    expect(typeof adapter.disconnect).toBe('function');
    expect(typeof adapter.runQuery).toBe('function');
  });

  it('NodeConfig type is compatible across packages', () => {
    const config: NodeConfig<string, Record<string, any>> = {
      label: 'Test',
      properties: {},
      relations: {},
    };

    expect(config.label).toBe('Test');
    expect(config.properties).toEqual({});
    expect(config.relations).toEqual({});
  });
});
