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
        replacement: path.resolve(__dirname, '../packages/sdk/src/index.ts'),
      },
      {
        find: /^@graph-om\/sdk\/driver\/(neo4j|memgraph|kuzu|falkordb)$/,
        replacement: path.resolve(__dirname, '../packages/sdk/src/driver/$1.ts'),
      },
      {
        find: /^@graph-om\/sdk\/(schema|client|query|config|driver|migration|seed|visualization|testing|graphql|batch|auth|observability|otel|benchmark)$/,
        replacement: path.resolve(__dirname, '../packages/sdk/src/$1/index.ts'),
      },
      {
        find: '@graph-om/neo4j',
        replacement: path.resolve(__dirname, '../packages/neo4j/src/index.ts'),
      },
      {
        find: '@graph-om/memgraph',
        replacement: path.resolve(__dirname, '../packages/memgraph/src/index.ts'),
      },
      {
        find: '@graph-om/zod',
        replacement: path.resolve(__dirname, '../packages/zod/src/index.ts'),
      },
      {
        find: '@graph-om/testing',
        replacement: path.resolve(__dirname, '../packages/testing/src/index.ts'),
      },
      {
        find: '@graph-om/migrate',
        replacement: path.resolve(__dirname, '../packages/migrate/src/index.ts'),
      },
    ],
  },
});
