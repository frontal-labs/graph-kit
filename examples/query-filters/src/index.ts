// index.ts - Where clauses, operators, AND/OR/NOT
// Run: pnpm start
// Requires Neo4j

import { GraphClient } from '@graph-kit/sdk';
import { createNeo4jDriver } from '@graph-kit/sdk/driver/neo4j';
import { graph, type UserRow } from './schema.js';

const driver = createNeo4jDriver({
  type: 'neo4j',
  uri: process.env.NEO4J_URI ?? 'bolt://localhost:7687',
  username: process.env.NEO4J_USER ?? 'neo4j',
  password: process.env.NEO4J_PASSWORD ?? 'password',
});

async function main() {
  await driver.connect();
  const client = new GraphClient(driver, graph);

  try {
    await client.raw("MATCH (n) WHERE n.id STARTS WITH 'qf-' DETACH DELETE n");

    const users = [
      { id: 'qf-alice', name: 'Alice', email: 'alice@example.com', age: 28 },
      { id: 'qf-bob', name: 'Bob', email: 'bob@example.com', age: 32 },
      { id: 'qf-carol', name: 'Carol', email: 'carol@example.com', age: 25 },
      { id: 'qf-dave', name: 'Dave', email: 'dave@example.com', age: 30 },
    ];
    for (const u of users) {
      await client.create<UserRow>('User', { data: u });
    }

    console.log('--- Comparison operators ---');
    const adults = await client.findMany<UserRow>('User', {
      where: { age: { gte: 18, lte: 32 } },
      orderBy: { age: 'desc' },
    });
    console.log('age 18-32 desc:', adults.map((u) => `${u.name}(${u.age})`).join(', '));

    console.log('\n--- Equality / IN / contains ---');
    const byEmails = await client.findMany<UserRow>('User', {
      where: { email: { in: ['alice@example.com', 'dave@example.com'] } },
    });
    console.log('in emails:', byEmails.map((u) => u.name).join(', '));

    const containsA = await client.findMany<UserRow>('User', {
      where: { name: { contains: 'a' } },
    });
    console.log('name contains "a":', containsA.map((u) => u.name).join(', '));

    console.log('\n--- AND / OR / NOT ---');
    const andOr = await client.findMany<UserRow>('User', {
      where: {
        AND: [{ age: { gte: 25 } }, { OR: [{ name: 'Alice' }, { name: 'Dave' }] }],
      },
    });
    console.log('age>=25 AND (Alice OR Dave):', andOr.map((u) => u.name).join(', '));

    const notYoung = await client.findMany<UserRow>('User', {
      where: { NOT: { age: { lt: 30 } } },
      orderBy: { name: 'asc' },
    });
    console.log('NOT age<30:', notYoung.map((u) => u.name).join(', '));
  } finally {
    await driver.disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
