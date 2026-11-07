import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  external: ['@graph-om/graph-om'],
  banner: {
    js: '// @graph-om/testing - Testing utilities for Graph-OM',
  },
});
