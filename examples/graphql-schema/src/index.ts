// index.ts - Generate GraphQL SDL and resolvers from the schema
// Run: pnpm start
// Requires Neo4j (only to exercise resolvers; SDL generation needs no DB)

import { GraphClient } from '@graph-kit/sdk';
import { createNeo4jDriver } from '@graph-kit/sdk/driver/neo4j';
import { generateGraphQLSchema, generateResolvers } from '@graph-kit/sdk/graphql';
import { graph } from './schema.js';

const driver = createNeo4jDriver({
  type: 'neo4j',
  uri: process.env.NEO4J_URI ?? 'bolt://localhost:7687',
  username: process.env.NEO4J_USER ?? 'neo4j',
  password: process.env.NEO4J_PASSWORD ?? 'password',
});

type Resolver = (parent: unknown, args: Record<string, unknown>) => Promise<unknown>;
type ResolverMap = {
  Query: Record<string, Resolver>;
  Mutation: Record<string, Resolver>;
};

function resolver(map: Record<string, Resolver>, name: string): Resolver {
  const fn = map[name];
  if (!fn) throw new Error(`No resolver named ${name}`);
  return fn;
}

async function main() {
  await driver.connect();
  const client = new GraphClient(driver, graph);

  try {
    // 1. The schema definition language for the current graph schema
    const sdl = generateGraphQLSchema({ schema: graph, includeRelations: true });
    console.log('--- Generated SDL ---');
    console.log(sdl);

    // 2. Resolvers backed by the client
    const resolvers = generateResolvers({ schema: graph, client }) as unknown as ResolverMap;

    await client.raw("MATCH (n) WHERE n.id STARTS WITH 'gql-' DETACH DELETE n");

    const created = await resolver(resolvers.Mutation, 'createUser')(null, {
      data: { id: 'gql-dana', name: 'Dana', email: 'dana@gql.example', age: 27 },
    });
    console.log('\nMutation createUser ->', (created as { name: string }).name);

    const found = await resolver(resolvers.Query, 'user')(null, {
      where: { id: 'gql-dana' },
    });
    console.log('Query user ->', (found as { name: string } | null)?.name);

    await client.raw("MATCH (n) WHERE n.id STARTS WITH 'gql-' DETACH DELETE n");
  } finally {
    await driver.disconnect();
  }

  console.log('\nGraphQL schema example complete.');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
