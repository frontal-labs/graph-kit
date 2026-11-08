// @graph-om/sdk/tests/integration-falkordb.test.ts
// Runs against a live FalkorDB. Set FALKORDB_URI (for example redis://127.0.0.1:6380).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFalkorDBDriver } from '../src/driver/falkordb';

const uri = process.env['FALKORDB_URI'];
const describeIntegration = uri ? describe : describe.skip;

describeIntegration('FalkorDB integration', () => {
  const driver = uri
    ? createFalkorDBDriver({ type: 'falkordb', uri, username: '', password: '' })
    : null;

  beforeAll(async () => {
    await driver?.connect();
    await driver?.runQuery('MATCH (n) DETACH DELETE n');
  });

  afterAll(async () => {
    await driver?.runQuery('MATCH (n) DETACH DELETE n');
    await driver?.disconnect();
  });

  it('round-trips parameters and typed scalars', async () => {
    const result = await driver!.runQuery('RETURN $name AS name, $age AS age, null AS nothing', {
      name: 'Ada',
      age: 36,
    });

    expect(result.keys).toEqual(['name', 'age', 'nothing']);
    expect(result.records[0]?.toObject()).toEqual({ name: 'Ada', age: 36, nothing: null });
  });

  it('commits a transaction so later reads see it', async () => {
    await driver!.runInTransaction(async (tx) => {
      await tx.run("CREATE (:Person {name: 'Grace'})");
    });

    const result = await driver!.runQuery("MATCH (p:Person {name: 'Grace'}) RETURN p.name AS name");
    expect(result.records.map((r) => r.get('name'))).toEqual(['Grace']);
  });

  it('returns no records for a write without RETURN', async () => {
    const result = await driver!.runQuery("CREATE (:Person {name: 'Linus'})");
    expect(result.records).toEqual([]);
  });
});
