// index.ts - Basic CRUD with the Graph-OM client
// Run: pnpm start

import { createNeo4jDriver } from '@graph-om/neo4j';
import { GraphClient } from '@graph-om/sdk';
import { graph } from './schema.js';

const driver = createNeo4jDriver({
  type: 'neo4j',
  uri: process.env.NEO4J_URI ?? 'bolt://localhost:7687',
  username: process.env.NEO4J_USER ?? 'neo4j',
  password: process.env.NEO4J_PASSWORD ?? 'password',
});

type UserRow = {
  id: string;
  name: string;
  email: string;
  age: number | null;
  createdAt: Date;
};

async function main() {
  await driver.connect();
  const client = new GraphClient(driver, graph);

  // Create
  const alice = await client.create<UserRow>('User', {
    data: { id: 'basic-alice', name: 'Alice', email: 'alice@basic.example', age: 28 },
  });
  console.log('created:', alice.name);

  // Upsert (create-or-update by unique key)
  await client.upsert<UserRow>('User', {
    where: { id: 'basic-alice' },
    create: { id: 'basic-alice', name: 'Alice', email: 'alice@basic.example', age: 28 },
    update: { age: 29 },
  });

  // Find one by primary key
  const found = await client.findUnique<UserRow>('User', {
    where: { id: 'basic-alice' },
  });
  console.log('findUnique:', found?.name, 'age', found?.age);

  // Find many with a where clause, ordering and paging
  const adults = await client.findMany<UserRow>('User', {
    where: { age: { gte: 18 } },
    orderBy: { name: 'asc' },
    limit: 10,
  });
  console.log(
    'findMany (adults):',
    adults.map((u) => u.name),
  );

  // Update
  const updated = await client.update<UserRow>('User', {
    where: { id: 'basic-alice' },
    data: { name: 'Alice Updated' },
  });
  console.log('updated:', updated.name);

  // Count
  const total = await client.count('User', { id: { eq: 'basic-alice' } });
  console.log('count (basic-alice):', total);

  // Delete
  await client.delete<UserRow>('User', { where: { id: 'basic-alice' } });
  const gone = await client.findUnique<UserRow>('User', { where: { id: 'basic-alice' } });
  console.log('after delete:', gone);

  await driver.disconnect();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
