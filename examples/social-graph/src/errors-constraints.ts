// errors-constraints.ts - Handle database rejections with typed errors
// Run: pnpm start:errors-constraints
// Needs a running Neo4j (docker compose up -d from the repo root).

import { GraphClient, hasCode } from '@graph-om/sdk';
import { createNeo4jDriver } from '@graph-om/sdk/driver/neo4j';
import { graph } from './schema.js';

const driver = createNeo4jDriver({
  type: 'neo4j',
  uri: process.env.NEO4J_URI ?? 'bolt://localhost:7687',
  username: process.env.NEO4J_USER ?? 'neo4j',
  password: process.env.NEO4J_PASSWORD ?? 'password',
});

type UserRow = { id: string; name: string; email: string };

async function main() {
  await driver.connect();
  const client = new GraphClient(driver, graph);

  try {
    // Make the uniqueness rule explicit, so the example does not depend on migrations having run
    await client.raw(
      'CREATE CONSTRAINT user_id_unique IF NOT EXISTS FOR (u:User) REQUIRE u.id IS UNIQUE',
    );
    await client.raw("MATCH (n) WHERE n.id STARTS WITH 'err-' DETACH DELETE n");

    await client.create<UserRow>('User', {
      data: { id: 'err-dup', name: 'First', email: 'first@err.example' },
    });
    console.log('created the first user');

    // 1. A duplicate id violates the constraint: the typed error says so
    try {
      await client.create<UserRow>('User', {
        data: { id: 'err-dup', name: 'Second', email: 'second@err.example' },
      });
    } catch (error) {
      if (hasCode(error, 'constraint_violation')) {
        console.log(
          'duplicate rejected:',
          error.code,
          `(HTTP ${error.statusCode}, retry=${error.retry.retryable})`,
        );
        console.log('driver code:', error.metadata?.driverCode);
        console.log(
          'the first user is still there:',
          (await client.findUnique<UserRow>('User', { where: { id: 'err-dup' } }))?.name,
        );
      } else {
        throw error;
      }
    }

    // 2. A malformed query is a query_syntax_error, not a generic failure
    try {
      await client.raw('MATCH (n RETURN n');
    } catch (error) {
      if (hasCode(error, 'query_syntax_error')) {
        console.log('syntax error caught:', error.code, `(HTTP ${error.statusCode})`);
      } else {
        throw error;
      }
    }

    // 3. upsert is the usual way to avoid the duplicate in the first place
    const upserted = await client.upsert<UserRow>('User', {
      where: { id: 'err-dup' },
      create: { id: 'err-dup', name: 'First', email: 'first@err.example' },
      update: { name: 'First (updated)' },
    });
    console.log('upsert updated instead:', upserted.name);
  } finally {
    await client.raw("MATCH (n) WHERE n.id STARTS WITH 'err-' DETACH DELETE n").catch(() => {});
    await driver.disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('unexpected failure:', error);
  process.exitCode = 1;
});
