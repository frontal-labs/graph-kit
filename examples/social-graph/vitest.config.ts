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
      '@graph-kit/sdk': path.resolve(__dirname, '../../packages/sdk/src/index.ts'),
      '@graph-kit/sdk/driver/neo4j': path.resolve(
        __dirname,
        '../../packages/sdk/src/driver/neo4j.ts',
      ),
      '@graph-kit/zod': path.resolve(__dirname, '../../packages/zod/src/index.ts'),
      '@graph-kit/testing': path.resolve(__dirname, '../../packages/sdk/src/testing/index.ts'),
      '@graph-kit/sdk/migration': path.resolve(
        __dirname,
        '../../packages/sdk/src/migration/index.ts',
      ),
      '@graph-kit/sdk/graphql': path.resolve(__dirname, '../../packages/sdk/src/graphql/index.ts'),
    },
  },
});
