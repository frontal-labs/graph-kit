import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  external: ['neo4j-driver', '@graph-om/core'],
  banner: {
    js: '// @graph-om/neo4j - Neo4j driver adapter for Graph-OM',
  },
});
