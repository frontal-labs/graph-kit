import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: false,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  external: ['zod', '@graph-kit/sdk'],
  banner: {
    js: '// @graph-kit/zod - Zod validation integration for Graph-Kit',
  },
});
