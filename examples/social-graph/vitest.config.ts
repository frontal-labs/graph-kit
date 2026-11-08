import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
  resolve: {
    alias: {
      '@graph-om/sdk': path.resolve(__dirname, '../../packages/sdk/src/index.ts'),
      '@graph-om/sdk/driver/neo4j': path.resolve(
        __dirname,
        '../../packages/sdk/src/driver/neo4j.ts',
      ),
      '@graph-om/zod': path.resolve(__dirname, '../../packages/zod/src/index.ts'),
      '@graph-om/testing': path.resolve(__dirname, '../../packages/sdk/src/testing/index.ts'),
      '@graph-om/sdk/migration': path.resolve(
        __dirname,
        '../../packages/sdk/src/migration/index.ts',
      ),
      '@graph-om/sdk/graphql': path.resolve(__dirname, '../../packages/sdk/src/graphql/index.ts'),
    },
  },
});
