import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/schema/index.ts',
    'src/client/index.ts',
    'src/query/index.ts',
    'src/config/index.ts',
    'src/driver/index.ts',
    'src/migration/index.ts',
    'src/schema/parser.ts',
    'src/seed/index.ts',
    'src/observability/index.ts',
    'src/graphql/index.ts',
    'src/visualization/index.ts',
    'src/auth/index.ts',
    'src/testing/index.ts',
    'src/otel/index.ts',
    'src/benchmark/index.ts',
  ],
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  external: ['neo4j-driver', 'zod', 'ioredis', '@redis/client', 'kuzu'],
  banner: {
    js: '// @graph-om/graph-om - Prisma-like DX for graph databases',
  },
});
