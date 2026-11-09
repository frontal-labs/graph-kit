// index.ts - Query logging, metrics, profiling
// Run: pnpm start
// Requires Neo4j

import { GraphClient } from '@graph-kit/sdk';
import { createNeo4jDriver } from '@graph-kit/sdk/driver/neo4j';
import {
  createQueryLogger,
  createQueryProfiler,
  LoggingDriverAdapter,
  PrometheusMetricsCollector,
} from '@graph-kit/sdk/observability';
import { graph, type UserRow } from './schema.js';

const driver = createNeo4jDriver({
  type: 'neo4j',
  uri: process.env.NEO4J_URI ?? 'bolt://localhost:7687',
  username: process.env.NEO4J_USER ?? 'neo4j',
  password: process.env.NEO4J_PASSWORD ?? 'password',
});

async function main() {
  await driver.connect();

  try {
    await client.raw("MATCH (n) WHERE n.id STARTS WITH 'obs-' DETACH DELETE n");

    // Query logger: prints every Cypher statement and its params.
    const queryLogger = createQueryLogger({ enabled: true });
    const loggedDriver = new LoggingDriverAdapter(driver, queryLogger);
    const loggedClient = new GraphClient(loggedDriver, graph);

    await loggedClient.create<UserRow>('User', {
      data: { id: 'obs-alice', name: 'Alice', email: 'alice@example.com', age: 28 },
    });

    await loggedClient.findUnique<UserRow>('User', { where: { id: 'obs-alice' } });

    // Query profiler: run EXPLAIN/PROFILE on a statement.
    const profiler = createQueryProfiler(driver);
    const explain = await profiler.explain('MATCH (u:User) WHERE u.id = $id RETURN u', {
      id: 'obs-alice',
    });
    console.log('\n--- Profiled EXPLAIN ---');
    console.log('  operator:', explain.plan.operatorType);
    console.log('  estimated rows:', explain.plan.estimatedRows);

    // Metrics collector (Prometheus-compatible) - expose counters/histograms.
    const metrics = new PrometheusMetricsCollector();
    metrics.incrementCounter('graph_kit_queries_total', { operation: 'create' });
    metrics.incrementCounter('graph_kit_queries_total', { operation: 'find' });
    metrics.recordHistogram('graph_kit_query_duration_ms', 12.5);

    console.log('\n--- Prometheus metrics sample ---');
    console.log(metrics.getMetrics());

    console.log('\nObservability example complete.');
  } finally {
    await driver.disconnect();
  }
}

// Declared after main so it's hoisted; used inside main above.
const client = new GraphClient(driver, graph);

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
