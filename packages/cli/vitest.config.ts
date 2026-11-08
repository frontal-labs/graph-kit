import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: {
    __GRAPH_OM_CLI_VERSION__: JSON.stringify('1.0.0'),
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Schema parsing builds a TypeScript program, which needs more than the 5s default
    testTimeout: 20_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['tests/**'],
    },
  },
  resolve: {
    alias: [
      // Exact matches only, so '@graph-om/sdk' does not swallow its subpaths
      {
        find: /^@graph-om\/sdk$/,
        replacement: path.resolve(__dirname, '../sdk/src/index.ts'),
      },
      {
        find: /^@graph-om\/sdk\/driver\/(neo4j|memgraph|kuzu|falkordb)$/,
        replacement: path.resolve(__dirname, '../sdk/src/driver/$1.ts'),
      },
      {
        find: /^@graph-om\/sdk\/(schema|client|query|config|driver|migration|seed|visualization|testing|graphql|batch|auth|observability|otel|benchmark)$/,
        replacement: path.resolve(__dirname, '../sdk/src/$1/index.ts'),
      },
      {
        find: '@graph-om/zod',
        replacement: path.resolve(__dirname, '../zod/src/index.ts'),
      },
      {
        find: '@graph-om/testing',
        replacement: path.resolve(__dirname, '../testing/src/index.ts'),
      },
      {
        find: '@graph-om/migrate',
        replacement: path.resolve(__dirname, '../migrate/src/index.ts'),
      },
    ],
  },
});
