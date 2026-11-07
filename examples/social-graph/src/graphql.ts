// graphql.ts - Generate GraphQL SDL and resolvers from the schema
// Run: pnpm start:graphql
//
// @graph-om/sdk generates the SDL and the resolver map. It does not start a server: plug the
// resolvers into your GraphQL server of choice (Apollo, Yoga, graphql-js).

import { createNeo4jDriver } from '@graph-om/neo4j';
import { GraphClient } from '@graph-om/sdk';
import { generateGraphQLSchema, generateResolvers } from '@graph-om/sdk/graphql';
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

    const created = await resolvers.Mutation['createUser']!(null, {
      data: { id: 'gql-dana', name: 'Dana', email: 'dana@gql.example', age: 27 },
    });
    console.log('\nMutation createUser ->', (created as { name: string }).name);

    const users = await resolvers.Query['users']!(null, {
      where: { id: { startsWith: 'gql-' } },
    });
    console.log(
      'Query users ->',
      (users as Array<{ name: string }>).map((u) => u.name),
    );

    const count = await resolvers.Query['usersCount']!(null, {
      where: { id: { startsWith: 'gql-' } },
    });
    console.log('Query usersCount ->', count);
  } finally {
    await client.raw("MATCH (n) WHERE n.id STARTS WITH 'gql-' DETACH DELETE n");
    await driver.disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
