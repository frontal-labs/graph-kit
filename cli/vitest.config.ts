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
    alias: {
      '@graph-om/graph-om': path.resolve(__dirname, '../packages/graph-om/src/index.ts'),
      '@graph-om/graph-om/schema': path.resolve(
        __dirname,
        '../packages/graph-om/src/schema/index.ts',
      ),
      '@graph-om/graph-om/client': path.resolve(
        __dirname,
        '../packages/graph-om/src/client/index.ts',
      ),
      '@graph-om/graph-om/query': path.resolve(
        __dirname,
        '../packages/graph-om/src/query/index.ts',
      ),
      '@graph-om/graph-om/config': path.resolve(
        __dirname,
        '../packages/graph-om/src/config/index.ts',
      ),
      '@graph-om/graph-om/driver': path.resolve(
        __dirname,
        '../packages/graph-om/src/driver/index.ts',
      ),
      '@graph-om/graph-om/driver/neo4j': path.resolve(
        __dirname,
        '../packages/graph-om/src/driver/neo4j.ts',
      ),
      '@graph-om/graph-om/driver/memgraph': path.resolve(
        __dirname,
        '../packages/graph-om/src/driver/memgraph.ts',
      ),
      '@graph-om/neo4j': path.resolve(__dirname, '../packages/neo4j/src/index.ts'),
      '@graph-om/memgraph': path.resolve(__dirname, '../packages/memgraph/src/index.ts'),
      '@graph-om/zod': path.resolve(__dirname, '../packages/zod/src/index.ts'),
      '@graph-om/testing': path.resolve(__dirname, '../packages/testing/src/index.ts'),
      '@graph-om/migrate': path.resolve(__dirname, '../packages/migrate/src/index.ts'),
    },
  },
});
