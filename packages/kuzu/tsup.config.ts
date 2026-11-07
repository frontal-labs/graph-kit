import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  external: ['kuzu', '@graph-om/sdk'],
  banner: {
    js: '// @graph-om/kuzu - Kuzu driver adapter for Graph-OM',
  },
});
