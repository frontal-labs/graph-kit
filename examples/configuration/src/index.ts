// index.ts - defineConfig, env, loadConfig
// Run: pnpm start
// Does NOT require a database.

import { defineConfig, env, loadConfig } from '@graph-kit/sdk';

// ---------------------------------------------------------------------------
// defineConfig: build a Graph-Kit config object programmatically
// ---------------------------------------------------------------------------

const config = defineConfig({
  schema: './src/schema.ts',
  output: {
    directory: './src/__generated__',
    zod: true,
  },
  driver: {
    type: 'neo4j',
    uri: process.env.NEO4J_URI ?? 'bolt://localhost:7687',
    username: process.env.NEO4J_USER ?? 'neo4j',
    password: process.env.NEO4J_PASSWORD ?? 'password',
  },
  debug: true,
});

console.log('--- defineConfig ---');
console.log('  schema:', config.schema);
console.log('  output.directory:', config.output?.directory);
console.log('  output.zod:', config.output?.zod);
console.log('  driver.type:', config.driver?.type);
console.log('  debug:', config.debug);

// ---------------------------------------------------------------------------
// env: typed environment variable access
// ---------------------------------------------------------------------------

console.log('\n--- env ---');
console.log('  NEO4J_URI:', env.NEO4J_URI ?? '(not set)');
console.log('  NEO4J_USER:', env.NEO4J_USER ?? '(not set)');
console.log('  NEO4J_PASSWORD:', env.NEO4J_PASSWORD ? '****' : '(not set)');

// ---------------------------------------------------------------------------
// loadConfig: load config from a config file path
// ---------------------------------------------------------------------------

console.log('\n--- loadConfig ---');
const loaded = await loadConfig('./graph.config.ts');
if (loaded) {
  console.log('  loaded schema:', loaded.schema);
  console.log('  loaded driver type:', loaded.driver?.type);
} else {
  console.log('  no config file found (skipped)');
}

console.log('\nConfiguration example complete (no database required).');
