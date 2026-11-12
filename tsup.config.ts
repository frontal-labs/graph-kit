import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'esbuild';
import { defineConfig } from 'tsup';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)));

/**
 * Resolve @graph-kit/sdk and its subpaths to their TypeScript source files so
 * the root bundle inlines the SDK instead of resolving through @graph-kit/sdk's
 * package.json exports (which point at dist/ files that don't exist on a clean
 * checkout).
 */
const sdkSourceAlias: Plugin = {
  name: 'sdk-source-alias',
  setup(build) {
    const map: Record<string, string> = {
      '@graph-kit/sdk/schema/parser': 'packages/sdk/src/schema/parser.ts',
      '@graph-kit/sdk/schema': 'packages/sdk/src/schema/index.ts',
      '@graph-kit/sdk/client': 'packages/sdk/src/client/index.ts',
      '@graph-kit/sdk/errors': 'packages/sdk/src/errors/index.ts',
      '@graph-kit/sdk/query': 'packages/sdk/src/query/index.ts',
      '@graph-kit/sdk/config': 'packages/sdk/src/config/index.ts',
      '@graph-kit/sdk/driver/neo4j': 'packages/sdk/src/driver/neo4j.ts',
      '@graph-kit/sdk/driver/memgraph': 'packages/sdk/src/driver/memgraph.ts',
      '@graph-kit/sdk/driver/kuzu': 'packages/sdk/src/driver/kuzu.ts',
      '@graph-kit/sdk/driver/falkordb': 'packages/sdk/src/driver/falkordb.ts',
      '@graph-kit/sdk/driver': 'packages/sdk/src/driver/index.ts',
      '@graph-kit/sdk/migration': 'packages/sdk/src/migration/index.ts',
      '@graph-kit/sdk/seed': 'packages/sdk/src/seed/index.ts',
      '@graph-kit/sdk/observability': 'packages/sdk/src/observability/index.ts',
      '@graph-kit/sdk/graphql': 'packages/sdk/src/graphql/index.ts',
      '@graph-kit/sdk/visualization': 'packages/sdk/src/visualization/index.ts',
      '@graph-kit/sdk/batch': 'packages/sdk/src/batch/index.ts',
      '@graph-kit/sdk/auth': 'packages/sdk/src/auth/index.ts',
      '@graph-kit/sdk/testing': 'packages/sdk/src/testing/index.ts',
      '@graph-kit/sdk/otel': 'packages/sdk/src/otel/index.ts',
      '@graph-kit/sdk/benchmark': 'packages/sdk/src/benchmark/index.ts',
      '@graph-kit/sdk': 'packages/sdk/src/index.ts',
    };

    build.onResolve({ filter: /^@graph-kit\/sdk(\/.*)?$/ }, (args) => {
      const target = map[args.path];
      if (target) {
        return { path: resolve(rootDir, target) };
      }
      return undefined;
    });
  },
};

export default defineConfig({
  entry: {
    index: 'packages/sdk/src/index.ts',
    cli: 'packages/cli/src/index.ts',
    driver: 'packages/sdk/src/driver/index.ts',
    neo4j: 'packages/sdk/src/driver/neo4j.ts',
    memgraph: 'packages/sdk/src/driver/memgraph.ts',
    kuzu: 'packages/sdk/src/driver/kuzu.ts',
    falkordb: 'packages/sdk/src/driver/falkordb.ts',
  },
  format: ['cjs', 'esm'],
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  outDir: 'dist',
  external: ['neo4j-driver', 'zod', 'ioredis', '@redis/client', 'kuzu'],
  esbuildPlugins: [sdkSourceAlias],
  banner: {
    js: '#!/usr/bin/env node\n// graph-kit - Prisma-like DX for graph databases',
  },
});
