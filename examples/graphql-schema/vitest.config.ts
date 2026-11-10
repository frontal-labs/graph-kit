import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@graph-kit/sdk': path.resolve(__dirname, '../../packages/sdk/src/index.ts'),
      '@graph-kit/sdk/graphql': path.resolve(__dirname, '../../packages/sdk/src/graphql/index.ts'),
    },
  },
});
