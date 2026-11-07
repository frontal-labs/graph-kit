// @graph-om/sdk/tests/integration.test.ts
// Opt-in integration tests against a live Neo4j instance.
// Run: docker compose up -d && NEO4J_URI=bolt://localhost:7687 NEO4J_USER=neo4j NEO4J_PASSWORD=password pnpm test
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GraphClient } from '../src/client';
import { node, relation, schema as sch, string } from '../src/schema';
import type { DriverAdapter } from '../src/types';

const uri = process.env['NEO4J_URI'];
const username = process.env['NEO4J_USER'] ?? 'neo4j';
const password = process.env['NEO4J_PASSWORD'] ?? 'password';

const describeIntegration = uri ? describe : describe.skip;

describeIntegration('GraphClient integration (live Neo4j)', () => {
  let client: GraphClient;
  let driverAdapter: DriverAdapter;

  const User = node('ItUser')
    .add('id', string({ primary: true }))
    .add('name', string())
    .add('friend', relation('IT_FOLLOWS', 'OUT', 'ItUser', { multiple: true }))
    .build();

  const graph = sch().add('ItUser', User).build();

  beforeAll(async () => {
    const { createNeo4jDriver } = await import('../src/driver/neo4j.js');
    driverAdapter = createNeo4jDriver({ type: 'neo4j', uri: uri!, username, password });
    await driverAdapter.connect();
    client = new GraphClient(driverAdapter, graph);
    await client.raw('MATCH (n:ItUser) DETACH DELETE n');
  }, 30_000);

  afterAll(async () => {
    if (driverAdapter) {
      try {
        await client.raw('MATCH (n:ItUser) DETACH DELETE n');
      } catch {
        /* ignore cleanup errors */
      }
      await driverAdapter.disconnect();
    }
  });

  it('creates, finds, updates, and deletes nodes', async () => {
    const created = await client.create('ItUser', {
      data: { id: 'i1', name: 'Alice' },
    });
    expect(created).toMatchObject({ id: 'i1', name: 'Alice' });

    const found = await client.findUnique('ItUser', { where: { id: 'i1' } });
    expect(found).toMatchObject({ id: 'i1' });

    const updated = await client.update('ItUser', {
      where: { id: 'i1' },
      data: { name: 'Alice Updated' },
    });
    expect(updated).toMatchObject({ name: 'Alice Updated' });

    await client.delete('ItUser', { where: { id: 'i1' } });
    const gone = await client.findUnique('ItUser', { where: { id: 'i1' } });
    expect(gone).toBeNull();
  }, 20_000);

  it('upserts by primary key', async () => {
    const first = await client.upsert('ItUser', {
      where: { id: 'i2' },
      create: { id: 'i2', name: 'Bob' },
      update: { name: 'Bob2' },
    });
    expect(first).toMatchObject({ name: 'Bob' });

    const second = await client.upsert('ItUser', {
      where: { id: 'i2' },
      create: { id: 'i2', name: 'Ignored' },
      update: { name: 'Bob Updated' },
    });
    expect(second).toMatchObject({ name: 'Bob Updated' });
  }, 20_000);

  it('relates and unrelates nodes by primary key', async () => {
    await client.create('ItUser', { data: { id: 'r1', name: 'R1' } });
    await client.create('ItUser', { data: { id: 'r2', name: 'R2' } });

    await client.relate('ItUser', 'r1', 'IT_FOLLOWS', 'ItUser', 'r2', 'OUT');

    const count = await client.count('ItUser');
    expect(count).toBe(2);

    await client.unrelate('ItUser', 'r1', 'IT_FOLLOWS', 'ItUser', 'r2', 'OUT');
    const rels = await client.raw('MATCH (:ItUser {id: "r1"})-[:IT_FOLLOWS]->() RETURN 1 AS x');
    expect(rels).toHaveLength(0);
  }, 20_000);

  it('runs a read/write transaction', async () => {
    const result = await client.transaction(async (tx) => {
      await tx.create('ItUser', { data: { id: 't1', name: 'Tx' } });
      return tx.findMany('ItUser', { where: { id: 't1' } });
    });
    expect(result).toHaveLength(1);
  }, 20_000);
});
