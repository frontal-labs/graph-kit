// Runs the CI benchmark suite against the Neo4j service and fails on regression.
// Connection settings come from the environment (NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD).
const { createNeo4jDriver } = require('../dist/driver/neo4j');
const { runCIOBenchmarks } = require('../dist/benchmark');

async function main() {
  const driver = createNeo4jDriver({
    type: 'neo4j',
    uri: process.env.NEO4J_URI ?? 'bolt://localhost:7687',
    username: process.env.NEO4J_USER ?? 'neo4j',
    password: process.env.NEO4J_PASSWORD ?? 'password',
  });

  await driver.connect();
  try {
    await runCIOBenchmarks(driver, {
      threshold: 20,
      failOnRegression: true,
      outputFormat: 'github-actions',
    });
  } finally {
    await driver.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
