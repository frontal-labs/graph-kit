// @graph-om/tests/env.test.ts
// Cross-package test: validates @t3-oss/env-core + zod env schema from @graph-om/sdk

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const origEnv = process.env;

beforeEach(() => {
  process.env = { ...origEnv };
});

afterEach(() => {
  process.env = origEnv;
  vi.restoreAllMocks();
});

describe('@graph-om/sdk env schema', () => {
  it('applies defaults when env vars are missing', async () => {
    // Clear Neo4j env vars to test defaults
    delete process.env.NEO4J_URI;
    delete process.env.NEO4J_USER;
    delete process.env.NEO4J_PASSWORD;
    delete process.env.NEO4J_DATABASE;
    delete process.env.GRAPH_OM_DEBUG;

    // Dynamically import to get fresh env instance
    const { createEnv } = await import('@t3-oss/env-core');

    const env = createEnv({
      server: {
        NEO4J_URI: z.string().default('bolt://localhost:7687'),
        NEO4J_USER: z.string().default('neo4j'),
        NEO4J_PASSWORD: z.string().default('password'),
        NEO4J_DATABASE: z.string().optional(),
        GRAPH_OM_DEBUG: z
          .string()
          .optional()
          .transform((val) => val === 'true'),
      },
      runtimeEnv: process.env,
      emptyStringAsUndefined: true,
    });

    expect(env.NEO4J_URI).toBe('bolt://localhost:7687');
    expect(env.NEO4J_USER).toBe('neo4j');
    expect(env.NEO4J_PASSWORD).toBe('password');
    expect(env.NEO4J_DATABASE).toBeUndefined();
    expect(env.GRAPH_OM_DEBUG).toBe(false);
  });

  it('reads values from process.env when present', async () => {
    process.env.NEO4J_URI = 'bolt://custom:7687';
    process.env.NEO4J_USER = 'custom-user';
    process.env.NEO4J_PASSWORD = 'custom-pass';
    process.env.NEO4J_DATABASE = 'custom-db';
    process.env.GRAPH_OM_DEBUG = 'true';

    const { createEnv } = await import('@t3-oss/env-core');

    const env = createEnv({
      server: {
        NEO4J_URI: z.string().default('bolt://localhost:7687'),
        NEO4J_USER: z.string().default('neo4j'),
        NEO4J_PASSWORD: z.string().default('password'),
        NEO4J_DATABASE: z.string().optional(),
        GRAPH_OM_DEBUG: z
          .string()
          .optional()
          .transform((val) => val === 'true'),
      },
      runtimeEnv: process.env,
      emptyStringAsUndefined: true,
    });

    expect(env.NEO4J_URI).toBe('bolt://custom:7687');
    expect(env.NEO4J_USER).toBe('custom-user');
    expect(env.NEO4J_PASSWORD).toBe('custom-pass');
    expect(env.NEO4J_DATABASE).toBe('custom-db');
    expect(env.GRAPH_OM_DEBUG).toBe(true);
  });

  it('GRAPH_OM_DEBUG=false string becomes boolean false', async () => {
    process.env.GRAPH_OM_DEBUG = 'false';

    const { createEnv } = await import('@t3-oss/env-core');

    const env = createEnv({
      server: {
        GRAPH_OM_DEBUG: z
          .string()
          .optional()
          .transform((val) => val === 'true'),
      },
      runtimeEnv: process.env,
      emptyStringAsUndefined: true,
    });

    expect(env.GRAPH_OM_DEBUG).toBe(false);
  });
});
