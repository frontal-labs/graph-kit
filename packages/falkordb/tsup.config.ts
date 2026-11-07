import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  external: ['redis', '@graph-om/graph-om'],
  banner: {
    js: '// @graph-om/falkordb - FalkorDB driver adapter for Graph-OM',
  },
});
