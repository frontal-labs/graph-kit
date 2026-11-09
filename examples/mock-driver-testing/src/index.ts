// index.ts - Unit testing without a database (mock driver)
// Run: pnpm start
// Does NOT require a database.

import { GraphClient } from '@graph-kit/sdk';
import { createMockDriver } from '@graph-kit/sdk/testing';
import { graph, type UserRow } from './schema.js';

async function main() {
  // The mock driver stores everything in memory — no Neo4j needed.
  const driver = createMockDriver();
  const client = new GraphClient(driver, graph);

  console.log('--- Create (mock) ---');
  const alice = await client.create<UserRow>('User', {
    data: { id: 'mock-alice', name: 'Alice', email: 'alice@example.com', age: 28 },
  });
  console.log('created:', alice.name);

  console.log('\n--- Find unique (mock) ---');
  const found = await client.findUnique<UserRow>('User', { where: { id: 'mock-alice' } });
  console.log('findUnique:', found?.name, 'age', found?.age);

  console.log('\n--- Find many with filter (mock) ---');
  const adults = await client.findMany<UserRow>('User', {
    where: { age: { gte: 18 } },
  });
  console.log('adults:', adults.map((u) => u.name).join(', '));

  console.log('\n--- Count (mock) ---');
  console.log('total users:', await client.count('User'));

  console.log('\n--- Update (mock) ---');
  const updated = await client.update<UserRow>('User', {
    where: { id: 'mock-alice' },
    data: { age: 29 },
  });
  console.log('updated alice age:', updated.age);

  console.log('\n--- Delete (mock) ---');
  await client.delete<UserRow>('User', { where: { id: 'mock-alice' } });
  const gone = await client.findUnique<UserRow>('User', { where: { id: 'mock-alice' } });
  console.log('alice after delete:', gone);

  console.log('\n--- Raw query (mock) ---');
  const all = await client.raw<{ name: string }>('MATCH (u:User) RETURN u.name AS name');
  console.log('all names:', all.map((r) => r.name).join(', '));

  console.log('\nMock driver testing example complete (no database required).');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
