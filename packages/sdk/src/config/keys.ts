// @graph-om/sdk/src/config/keys.ts
// Validated environment variables powered by @t3-oss/env-core + zod.
// All process.env values are parsed through this single schema, so the app
// fails fast on missing/invalid config instead of silently using undefined.

import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

export const env = createEnv({
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
