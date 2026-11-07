import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  external: ['zod', '@graph-om/sdk'],
  banner: {
    js: '// @graph-om/zod - Zod validation integration for Graph-OM',
  },
});
