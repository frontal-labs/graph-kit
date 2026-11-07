// testing.ts - Unit-testing code against the in-memory mock driver (no Neo4j needed)
// Run: pnpm start:testing
//
// The mock driver supports unfiltered reads, the query log, and writes. It does not apply
// inline property filters such as `MATCH (n:User {id: $id})`, so assert on filtered reads
// against a real database (see includes.ts and pagination.ts).

import assert from 'node:assert/strict';
import { GraphClient } from '@graph-om/sdk';
import { createMockDriver, createTestFixtures, generateRandomEmail } from '@graph-om/sdk/testing';
import { graph } from './schema.js';

type UserRow = { id: string; name: string; email: string; age: number | null };

// A function under test: the kind of code you want to cover with unit tests
async function listUserNames(client: GraphClient): Promise<string[]> {
  const users = await client.findMany<UserRow>('User', { orderBy: { name: 'asc' } });
  return users.map((u) => u.name);
}

async function main() {
  const driver = createMockDriver();
  const client = new GraphClient(driver, graph);

  // 1. Seed the mock with fixtures and read them back through the client
  const fixtures = createTestFixtures([
    {
      label: 'User',
      data: [
        { id: 'u-1', name: 'Ada', email: 'ada@test.example', age: 36 },
        { id: 'u-2', name: 'Lin', email: 'lin@test.example', age: 29 },
      ],
    },
  ]);
  driver.setData('User', fixtures['User'] ?? []);
  assert.deepEqual(await listUserNames(client), ['Ada', 'Lin']);
  console.log('ok: reads seeded fixtures:', await listUserNames(client));

  // 2. Inspect the Cypher the client sent, without a database
  driver.clearQueryLog();
  await listUserNames(client);
  const log = driver.getQueryLog();
  assert.equal(log.length, 1);
  assert.match(log[0]!.query, /MATCH \(n:User/);
  console.log('ok: query sent:', log[0]!.query.replace(/\s+/g, ' ').trim());

  // 3. Writes land in the mock store
  const before = driver.count('User');
  await client.create<UserRow>('User', {
    data: { id: 'u-3', name: 'Sam', email: generateRandomEmail(), age: null },
  });
  assert.equal(driver.count('User'), before + 1);
  console.log('ok: create increases the stored count to', driver.count('User'));

  await driver.disconnect();
  console.log('\nAll checks passed.');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
