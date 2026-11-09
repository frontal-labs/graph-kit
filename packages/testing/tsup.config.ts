import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: false,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  external: ['@graph-kit/sdk'],
  banner: {
    js: '// @graph-kit/testing - Testing utilities for Graph-Kit',
  },
});
