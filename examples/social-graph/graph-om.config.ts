import { defineConfig } from '@graph-om/core';

export default defineConfig({
  schema: './src/schema.ts',
  output: {
    directory: './src/__generated__',
    zod: true,
  },
  driver: {
    type: 'neo4j',
    uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
    username: process.env.NEO4J_USER || 'neo4j',
    password: process.env.NEO4J_PASSWORD || 'password',
  },
  debug: false,
});
