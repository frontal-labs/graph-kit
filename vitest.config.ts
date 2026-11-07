import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@graph-om/graph-om': path.resolve(__dirname, 'packages/graph-om/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['packages/**/src/**/*.ts', 'cli/src/**/*.ts'],
      exclude: ['tests/**', 'node_modules', 'dist', 'coverage', '.turbo'],
    },
  },
});
