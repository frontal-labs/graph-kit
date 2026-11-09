// aggregations.ts - count / sum / avg / min / max and grouped stats
// Run: pnpm start:aggregations

import { GraphClient } from '@graph-kit/sdk';
import { createNeo4jDriver } from '@graph-kit/sdk/driver/neo4j';
import { graph } from './schema.js';

const driver = createNeo4jDriver({
  type: 'neo4j',
  uri: process.env.NEO4J_URI ?? 'bolt://localhost:7687',
  username: process.env.NEO4J_USER ?? 'neo4j',
  password: process.env.NEO4J_PASSWORD ?? 'password',
});

type UserRow = { id: string; name: string; email: string; age: number | null };
type PostRow = { id: string; title: string; published: boolean };

async function seed(client: GraphClient) {
  await client.raw("MATCH (n) WHERE n.id STARTS WITH 'agg-' DETACH DELETE n");

  const people: Array<[string, string, number]> = [
    ['agg-ana', 'Ana', 22],
    ['agg-ben', 'Ben', 31],
    ['agg-cy', 'Cy', 45],
    ['agg-dee', 'Dee', 38],
  ];
  for (const [id, name, age] of people) {
    await client.create<UserRow>('User', {
      data: { id, name, email: `${id}@agg.example`, age },
    });
  }

  for (let i = 1; i <= 5; i++) {
    const id = `agg-post-${i}`;
    await client.create<PostRow>('Post', {
      data: { id, title: `Post ${i}`, published: i <= 3 },
    });
    // Ana and Ben write the posts; Ana writes three, Ben two
    await client.relate('User', i <= 3 ? 'agg-ana' : 'agg-ben', 'POSTED', 'Post', id);
  }
}

async function main() {
  await driver.connect();
  const client = new GraphClient(driver, graph);

  try {
    await seed(client);

    // Scalar aggregates over the whole label
    const users = await client.count('User', { id: { startsWith: 'agg-' } });
    const totalAge = await client.aggregate('User', 'sum', 'age', { id: { startsWith: 'agg-' } });
    const avgAge = await client.aggregate('User', 'avg', 'age', { id: { startsWith: 'agg-' } });
    const youngest = await client.aggregate('User', 'min', 'age', { id: { startsWith: 'agg-' } });
    const oldest = await client.aggregate('User', 'max', 'age', { id: { startsWith: 'agg-' } });
    console.log({ users, totalAge, avgAge, youngest, oldest });

    // Aggregates with a filter
    const published = await client.count('Post', { published: true, id: { startsWith: 'agg-' } });
    const drafts = await client.count('Post', { published: false, id: { startsWith: 'agg-' } });
    console.log({ published, drafts });

    // Grouped statistics need Cypher; the query runs through the same driver
    const perAuthor = await client.raw<{ author: string; posts: number }>(
      `MATCH (u:User)-[:POSTED]->(p:Post)
       WHERE u.id STARTS WITH 'agg-'
       RETURN u.name AS author, count(p) AS posts
       ORDER BY posts DESC`,
    );
    console.log('posts per author:', perAuthor);
  } finally {
    await client.raw("MATCH (n) WHERE n.id STARTS WITH 'agg-' DETACH DELETE n");
    await driver.disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
