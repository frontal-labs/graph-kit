import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'packages/sdk/src/index.ts',
    cli: 'packages/cli/src/index.ts',
    driver: 'packages/sdk/src/driver/index.ts',
    neo4j: 'packages/sdk/src/driver/neo4j.ts',
    memgraph: 'packages/sdk/src/driver/memgraph.ts',
    kuzu: 'packages/sdk/src/driver/kuzu.ts',
    falkordb: 'packages/sdk/src/driver/falkordb.ts',
  },
  format: ['cjs', 'esm'],
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  outDir: 'dist',
  external: ['neo4j-driver', 'zod', 'ioredis', '@redis/client', 'kuzu'],
  noExternal: ['@frontal-labs/error', '@graph-kit/sdk'],
  banner: {
    js: '#!/usr/bin/env node\n// graph-kit - Prisma-like DX for graph databases',
  },
});
