// index.ts - count(), aggregate(), raw Cypher groups
// Run: pnpm start
// Requires Neo4j

import { GraphClient } from '@graph-kit/sdk';
import { createNeo4jDriver } from '@graph-kit/sdk/driver/neo4j';
import { graph, type PostRow, type UserRow } from './schema.js';

const driver = createNeo4jDriver({
  type: 'neo4j',
  uri: process.env.NEO4J_URI ?? 'bolt://localhost:7687',
  username: process.env.NEO4J_USER ?? 'neo4j',
  password: process.env.NEO4J_PASSWORD ?? 'password',
});

async function main() {
  await driver.connect();
  const client = new GraphClient(driver, graph);

  try {
    await client.raw("MATCH (n) WHERE n.id STARTS WITH 'agg-' DETACH DELETE n");

    const users = [
      { id: 'agg-alice', name: 'Alice', age: 28 },
      { id: 'agg-bob', name: 'Bob', age: 32 },
      { id: 'agg-carol', name: 'Carol', age: 25 },
      { id: 'agg-dave', name: 'Dave', age: 30 },
    ];
    for (const u of users) {
      await client.create<UserRow>('User', { data: u });
    }
    await client.create<PostRow>('Post', {
      data: { id: 'agg-post-1', title: 'Published', published: true, viewCount: 10 },
    });
    await client.create<PostRow>('Post', {
      data: { id: 'agg-post-2', title: 'Draft', published: false, viewCount: 3 },
    });
    await client.create<PostRow>('Post', {
      data: { id: 'agg-post-3', title: 'Popular', published: true, viewCount: 50 },
    });

    console.log('--- count ---');
    console.log('total users:', await client.count('User'));
    console.log('users age>=30:', await client.count('User', { age: { gte: 30 } }));
    console.log('published posts:', await client.count('Post', { published: true }));

    console.log('\n--- aggregate ---');
    console.log('avg age:', await client.aggregate('User', 'avg', 'age'));
    console.log('min age:', await client.aggregate('User', 'min', 'age'));
    console.log('max age:', await client.aggregate('User', 'max', 'age'));
    console.log('sum viewCount:', await client.aggregate('Post', 'sum', 'viewCount'));

    console.log('\n--- raw Cypher groups ---');
    const byPublished = await client.raw<{ published: boolean; postCount: number }>(
      'MATCH (p:Post) RETURN p.published AS published, count(p) AS postCount ORDER BY published',
    );
    for (const row of byPublished) {
      console.log(`published=${row.published}: ${row.postCount} post(s)`);
    }

    const avgByAge = await client.raw<{ age: number; avgAge: number }>(
      'MATCH (u:User) RETURN u.age AS age, avg(u.age) AS avgAge ORDER BY age',
    );
    for (const row of avgByAge) {
      console.log(`age ${row.age}: avg ${row.avgAge}`);
    }
  } finally {
    await driver.disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
