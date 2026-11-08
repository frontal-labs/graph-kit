// errors-handling.ts - Branch on stable error codes instead of messages
// Run: pnpm start:errors-handling
// Parts 1 and 2 need no database: the client rejects unknown labels before it sends any query.

import { createNeo4jDriver } from '@graph-om/neo4j';
import { GraphClient, getRootCause, hasCode, isFrontalError } from '@graph-om/sdk';
import { graph } from './schema.js';

const driver = createNeo4jDriver({
  type: 'neo4j',
  uri: process.env.NEO4J_URI ?? 'bolt://localhost:7687',
  username: process.env.NEO4J_USER ?? 'neo4j',
  password: process.env.NEO4J_PASSWORD ?? 'password',
});

async function main() {
  const client = new GraphClient(driver, graph);

  // 1. An unregistered label fails before any query is sent
  try {
    await client.findMany('Ghost' as 'User');
  } catch (error) {
    if (hasCode(error, 'node_not_registered')) {
      console.log(
        '1. unknown label ->',
        error.code,
        `(HTTP ${error.statusCode}, retry=${error.retry.retryable})`,
      );
    }
  }

  // 2. Check with hasCode or isFrontalError rather than instanceof: instanceof can fail when the
  // error came from another entry point of the SDK (each bundles its own copy of the error classes)
  try {
    await client.findMany('Ghost' as 'User');
  } catch (error) {
    console.log(
      '2. isFrontalError:',
      isFrontalError(error),
      '| instanceof Error:',
      error instanceof Error,
    );
  }

  // 3. Database failures keep the original driver error on `cause`
  try {
    await driver.connect();
  } catch (error) {
    console.log(
      '3. skipped: no database reachable (',
      hasCode(error, 'connection_failed') ? 'connection_failed' : 'other',
      ')',
    );
    return;
  }
  try {
    await client.raw('THIS IS NOT CYPHER');
  } catch (error) {
    if (hasCode(error, 'query_syntax_error')) {
      console.log('3. syntax error ->', error.code, '| driver code:', error.metadata?.driverCode);
      console.log('   root cause is the driver error:', getRootCause(error) instanceof Error);
    }
  } finally {
    await driver.disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('unexpected failure:', error);
  process.exitCode = 1;
});
