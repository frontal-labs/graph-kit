// @graph-om/sdk/tests/integration-kuzu.test.ts
// Runs against the real `kuzu` package on a throwaway database. Kuzu is embedded, so no server.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createKuzuDriverAsync } from '../src/driver/index';

describe('Kuzu integration', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'graph-om-kuzu-'));
  const databasePath = path.join(dir, 'graph.kuzu');
  let driver: Awaited<ReturnType<typeof createKuzuDriverAsync>>;

  beforeAll(async () => {
    driver = await createKuzuDriverAsync({
      type: 'kuzu',
      databasePath,
      uri: '',
      username: '',
      password: '',
    });
    await driver.connect();
    await driver.runQuery('CREATE NODE TABLE Person(name STRING, age INT64, PRIMARY KEY(name))');
  });

  afterAll(async () => {
    await driver.disconnect();
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes with parameters and reads them back', async () => {
    await driver.runQuery('CREATE (:Person {name: $name, age: $age})', { name: 'Ada', age: 36 });
    const result = await driver.runQuery(
      'MATCH (p:Person {name: $name}) RETURN p.name AS name, p.age AS age',
      {
        name: 'Ada',
      },
    );

    expect(result.keys).toEqual(['name', 'age']);
    expect(result.records[0]?.toObject()).toEqual({ name: 'Ada', age: 36 });
  });

  it('lets a transaction read its own writes and commits them', async () => {
    await driver.runInTransaction(async (tx) => {
      await tx.run("CREATE (:Person {name: 'Grace', age: 85})");
      const seen = await tx.run("MATCH (p:Person {name: 'Grace'}) RETURN p.age AS age");
      expect(seen.records.map((r) => r.get('age'))).toEqual([85]);
    });

    const after = await driver.runQuery("MATCH (p:Person {name: 'Grace'}) RETURN p.name AS name");
    expect(after.records.map((r) => r.get('name'))).toEqual(['Grace']);
  });

  it('rolls back a failed transaction and keeps the typed error', async () => {
    const error = await driver
      .runInTransaction(async (tx) => {
        await tx.run("CREATE (:Person {name: 'Linus', age: 55})");
        await tx.run("CREATE (:Person {name: 'Ada', age: 1})");
      })
      .catch((e: unknown) => e);

    expect(error).toMatchObject({ code: 'query_failed' });
    const linus = await driver.runQuery("MATCH (p:Person {name: 'Linus'}) RETURN p.name AS name");
    expect(linus.records).toEqual([]);
  });

  it('returns a node with its properties', async () => {
    const result = await driver.runQuery("MATCH (p:Person {name: 'Ada'}) RETURN p");
    const node = result.records[0]?.get('p') as Record<string, unknown>;

    // Kuzu returns nodes as plain objects: the property values sit beside the internal _ID and _LABEL
    expect(node).toMatchObject({ name: 'Ada', age: 36 });
  });

  it('classifies a malformed query as query_failed with the driver error as cause', async () => {
    const error = await driver.runQuery('MATCH (p:Person RETURN p').catch((e: unknown) => e);

    expect(error).toMatchObject({ code: 'query_failed' });
    expect((error as { cause: unknown }).cause).toBeInstanceOf(Error);
  });
});
