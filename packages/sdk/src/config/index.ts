// @graph-kit/sdk/src/config/index.ts
// Graph-Kit configuration system — inspired by Vite's defineConfig, Prisma schema, Drizzle config

import type { GraphConfig, GraphDriverConfig, GraphOutputConfig } from '../types';

export { env } from './keys';

export type { GraphConfig, GraphDriverConfig, GraphOutputConfig };

export function defineConfig(config: GraphConfig): GraphConfig {
  return config;
}

export function resolveConfig(
  config: GraphConfig,
): Required<GraphConfig> & { output: Required<GraphOutputConfig> } {
  return {
    schema: config.schema,
    output: {
      directory: config.output?.directory ?? './src/__generated__',
      zod: config.output?.zod ?? false,
    },
    driver: {
      type: 'neo4j',
      uri: config.driver?.uri ?? 'bolt://localhost:7687',
      username: config.driver?.username ?? 'neo4j',
      password: config.driver?.password ?? 'password',
      database: config.driver?.database,
      maxConnectionLifetime: config.driver?.maxConnectionLifetime,
      maxTransactionRetryTime: config.driver?.maxTransactionRetryTime,
    },
    debug: config.debug ?? false,
    exclude: config.exclude ?? [],
  };
}

/**
 * Try to load a config file from the project root.
 * Supports graph.config.ts (preferred), graph.config.mjs, graph.config.js, graph.config.json,
 * and the legacy graph-kit.config.* names.
 */
export async function loadConfig(cwd?: string): Promise<GraphConfig | null> {
  const path = await import('node:path');
  const fs = await import('node:fs');
  const root = cwd ?? process.cwd();

  const candidates = [
    'graph.config.ts',
    'graph.config.mjs',
    'graph.config.js',
    'graph.config.json',
    'graph-kit.config.ts',
    'graph-kit.config.mjs',
    'graph-kit.config.js',
    'graph-kit.config.json',
  ];

  for (const file of candidates) {
    const fullPath = path.join(root, file);
    if (fs.existsSync(fullPath)) {
      if (file.endsWith('.json')) {
        const raw = fs.readFileSync(fullPath, 'utf-8');
        return JSON.parse(raw) as GraphConfig;
      }
      // Dynamic import of TS/JS config files
      try {
        const imported = await import(fullPath);
        const mod = imported.default ?? imported;
        if (typeof mod === 'function') return mod();
        return mod as GraphConfig;
      } catch {
        console.warn(`⚠ Could not load ${file}, trying next candidate.`);
      }
    }
  }

  return null;
}

export function getDefaultConfig(schemaPath?: string): GraphConfig {
  return {
    schema: schemaPath ?? './src/schema.ts',
    output: {
      directory: './src/__generated__',
      zod: false,
    },
    driver: {
      type: 'neo4j',
    },
    exclude: [],
  };
}
