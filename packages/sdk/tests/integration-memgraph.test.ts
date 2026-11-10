// @graph-kit/sdk/tests/integration-memgraph.test.ts
// Runs against a live Memgraph over Bolt. Set MEMGRAPH_URI (for example bolt://127.0.0.1:7688).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createMemgraphDriver } from '../src/driver/memgraph';

const uri = process.env['MEMGRAPH_URI'];
const describeIntegration = uri ? describe : describe.skip;

describeIntegration('Memgraph integration', () => {
  // Only connected when the suite runs (MEMGRAPH_URI is set)
  const driver = createMemgraphDriver({
    type: 'memgraph',
    uri: uri ?? 'bolt://127.0.0.1:7688',
    username: '',
    password: '',
  });

  beforeAll(async () => {
    await driver.connect();
    await driver.runQuery('MATCH (n) DETACH DELETE n');
  });

  afterAll(async () => {
    await driver.runQuery('MATCH (n) DETACH DELETE n');
    await driver.disconnect();
  });

  it('verifies connectivity and reports the server', async () => {
    await expect(driver.verifyConnectivity()).resolves.toBe(true);
    const info = await driver.getServerInfo();
    expect(info.protocol).toBe('bolt');
  });

  it('round-trips parameters and typed scalars', async () => {
    const result = await driver.runQuery('RETURN $name AS name, $age AS age, null AS nothing', {
      name: 'Ada',
      age: 36,
    });

    expect(result.records[0]?.toObject()).toEqual({ name: 'Ada', age: 36, nothing: null });
  });

  it('returns nodes with their labels and properties, and round-trips dates', async () => {
    const joinedAt = new Date('2024-05-01T10:00:00Z');
    await driver.runQuery('CREATE (:Member {name: $name, joinedAt: $joinedAt})', {
      name: 'Ada',
      joinedAt,
    });
    const result = await driver.runQuery('MATCH (m:Member {name: $name}) RETURN m', {
      name: 'Ada',
    });
    const node = result.records[0]?.get('m') as {
      labels: string[];
      properties: { name: string; joinedAt: Date };
    };

    expect(node.labels).toEqual(['Member']);
    expect(node.properties.name).toBe('Ada');
    expect(node.properties.joinedAt).toBeInstanceOf(Date);
    expect(node.properties.joinedAt.toISOString()).toBe(joinedAt.toISOString());
  });

  it('commits a transaction so later reads see it', async () => {
    await driver.runInTransaction(async (tx) => {
      await tx.run("CREATE (:Person {name: 'Grace'})");
    });

    const result = await driver.runQuery("MATCH (p:Person {name: 'Grace'}) RETURN p.name AS name");
    expect(result.records.map((r) => r.get('name'))).toEqual(['Grace']);
  });

  it('reports a malformed query as query_failed with the native code', async () => {
    // Memgraph uses one generic code for every query error (the syntax detail is only in the
    // message, which the adapter does not parse), so the native code is the reliable signal
    const error = await driver.runQuery('MATCH (n RETURN n').catch((e: unknown) => e);
    expect(error).toMatchObject({
      code: 'query_failed',
      metadata: { driverCode: 'Memgraph.ClientError.MemgraphError.MemgraphError' },
    });
  });
});
