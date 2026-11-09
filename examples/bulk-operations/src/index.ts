// index.ts - Batch processor, CSV/JSON import/export
// Run: pnpm start
// Requires Neo4j

import { writeFileSync } from 'node:fs';
import { GraphClient } from '@graph-kit/sdk';
import {
  createBatchProcessor,
  exportToCSV,
  exportToJSON,
  importFromJSON,
} from '@graph-kit/sdk/batch';
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
    await client.raw("MATCH (n) WHERE n.id STARTS WITH 'bulk-' DETACH DELETE n");

    const users = [
      { id: 'bulk-alice', name: 'Alice', email: 'alice@example.com', age: 28 },
      { id: 'bulk-bob', name: 'Bob', email: 'bob@example.com', age: 32 },
      { id: 'bulk-carol', name: 'Carol', email: 'carol@example.com', age: 25 },
      { id: 'bulk-dave', name: 'Dave', email: 'dave@example.com', age: 30 },
      { id: 'bulk-eve', name: 'Eve', email: 'eve@example.com', age: 27 },
    ];

    console.log('--- Batch processor ---');
    const processor = createBatchProcessor({ driver });
    const result = await processor.bulkInsert({
      label: 'User',
      data: users,
      onProgress: (p) => console.log(`  processed ${p.processed}/${p.total}`),
    });
    console.log(
      'bulk insert:',
      result.successful.length,
      'successful,',
      result.failed.length,
      'failed',
    );
    console.log('total users:', await client.count('User'));

    console.log('\n--- Export to JSON ---');
    const allUsers = await client.findMany<UserRow>('User', { limit: 10 });
    const json = exportToJSON(allUsers);
    console.log('exported JSON (first 200 chars):', json.slice(0, 200));

    console.log('\n--- Import from JSON (temp file) ---');
    const tmpFile = '/tmp/bulk-import-users.json';
    writeFileSync(tmpFile, json);
    await client.raw("MATCH (n) WHERE n.id STARTS WITH 'bulk-import-' DETACH DELETE n");
    const imported = await importFromJSON({ label: 'User', filePath: tmpFile });
    for (const u of imported.successful) {
      await client.create<UserRow>('User', {
        data: { ...(u as UserRow), id: `bulk-import-${String(u.id)}` },
      });
    }
    console.log('imported users:', imported.successful.length);
    console.log('total users now:', await client.count('User'));

    console.log('\n--- Export to CSV ---');
    const csv = exportToCSV(allUsers, { delimiter: ',' });
    console.log('exported CSV:');
    console.log(csv);

    console.log('\nBulk operations example complete.');
  } finally {
    await driver.disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
