// @graph-om/sdk/tests/driver-registry.test.ts
import { describe, expect, it } from 'vitest';
import { FalkorDBDriverAdapter } from '../src/driver/falkordb';
import { createDriver, listDrivers } from '../src/driver/index';
import { MemgraphDriverAdapter } from '../src/driver/memgraph';
import { Neo4jDriverAdapter } from '../src/driver/neo4j';

describe('driver registry', () => {
  it('lists every built-in driver', () => {
    expect(listDrivers()).toEqual(
      expect.arrayContaining(['neo4j', 'memgraph', 'falkordb', 'kuzu']),
    );
  });

  it('builds the Neo4j, Memgraph and FalkorDB adapters from plain config', () => {
    const neo = createDriver({
      type: 'neo4j',
      uri: 'bolt://localhost:7687',
      username: 'n',
      password: 'p',
    });
    const mem = createDriver({
      type: 'memgraph',
      uri: 'bolt://localhost:7688',
      username: 'n',
      password: 'p',
    });
    const fal = createDriver({
      type: 'falkordb',
      uri: 'redis://localhost:6379',
      username: '',
      password: '',
    });

    expect(neo).toBeInstanceOf(Neo4jDriverAdapter);
    expect(mem).toBeInstanceOf(MemgraphDriverAdapter);
    expect(fal).toBeInstanceOf(FalkorDBDriverAdapter);
  });

  it('points Kuzu at the async factory', () => {
    expect(() =>
      createDriver({ type: 'kuzu', databasePath: ':memory:', uri: '', username: '', password: '' }),
    ).toThrow(expect.objectContaining({ code: 'unsupported_option' }));
  });

  it('names the available drivers for an unknown type', () => {
    expect(() =>
      createDriver({ type: 'nope', uri: '', username: '', password: '' } as never),
    ).toThrow(/Unknown driver type: "nope"/);
  });
});
