// graphql.ts - GraphQL Integration Example
// Demonstrates GraphQL schema generation and server setup with Graph-OM

import { ApolloServer } from '@apollo/server';
import { GraphClient } from '@graph-om/core';
import {
  createApolloServerConfig,
  generateGraphQLSchema,
  generateResolvers,
} from '@graph-om/graphql';
import { createNeo4jDriver } from '@graph-om/neo4j';
import { graph } from './schema.js';

const URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const USER = process.env.NEO4J_USER || 'neo4j';
const PASSWORD = process.env.NEO4J_PASSWORD || 'password';

type UserRow = {
  id: string;
  name: string;
  email: string;
  age: number | null;
  createdAt: Date;
};

type PostRow = {
  id: string;
  title: string;
  content: string | null;
  published: boolean;
  createdAt: Date;
};

async function main() {
  const driver = createNeo4jDriver({ uri: URI, username: USER, password: PASSWORD });
  await driver.connect();
  const client = new GraphClient(driver, graph);

  console.log('=== GRAPHQL INTEGRATION EXAMPLES ===\n');

  // Create test data
  const _alice = await client.upsert<UserRow>('User', {
    where: { id: 'gql-user-1' },
    create: { id: 'gql-user-1', name: 'Alice', email: 'alice@example.com', age: 28 },
    update: {},
  });
  const _bob = await client.upsert<UserRow>('User', {
    where: { id: 'gql-user-2' },
    create: { id: 'gql-user-2', name: 'Bob', email: 'bob@example.com', age: 32 },
    update: {},
  });

  const _post1 = await client.upsert<PostRow>('Post', {
    where: { id: 'gql-post-1' },
    create: {
      id: 'gql-post-1',
      title: 'GraphQL + Graph-OM',
      content: 'Great combo',
      published: true,
    },
    update: {},
  });
  const _post2 = await client.upsert<PostRow>('Post', {
    where: { id: 'gql-post-2' },
    create: { id: 'gql-post-2', title: 'Draft Post', content: 'WIP', published: false },
    update: {},
  });

  await client.relate('Post', 'gql-post-1', 'POSTED', 'User', 'gql-user-1', 'IN');
  await client.relate('Post', 'gql-post-2', 'POSTED', 'User', 'gql-user-1', 'IN');
  await client.relate('User', 'gql-user-2', 'LIKES', 'Post', 'gql-post-1');

  console.log('--- Generating GraphQL Schema ---');

  // 1. Generate GraphQL schema from Graph-OM schema
  const graphqlSchema = generateGraphQLSchema(graph, {
    includeRelations: true,
    includeAggregations: true,
  });

  console.log('Generated GraphQL Schema:');
  console.log(`${graphqlSchema.substring(0, 500)}...\n`);

  // 2. Generate resolvers
  const resolvers = generateResolvers(graph, {
    client,
    defaultLimit: 10,
    maxLimit: 100,
  });

  console.log('Generated Resolvers:');
  console.log(Object.keys(resolvers.Query).join(', '));
  console.log(Object.keys(resolvers.Mutation).join(', '));
  console.log(Object.keys(resolvers.User || {}).join(', '));
  console.log(Object.keys(resolvers.Post || {}).join(', '));

  // 3. Create Apollo Server configuration
  console.log('\n--- Apollo Server Setup ---');
  const serverConfig = createApolloServerConfig(graph, {
    client,
    context: () => ({ client }),
    introspection: true,
  });

  // Create server instance
  const _server = new ApolloServer({
    typeDefs: serverConfig.typeDefs,
    resolvers: serverConfig.resolvers,
  });

  // Note: In a real app, you'd start the server:
  // const { url } = await startStandaloneServer(server, { listen: { port: 4000 } });
  // console.log(`🚀 Server ready at ${url}`);

  console.log('Apollo Server configured (not started in this example)');
  console.log('To start: await startStandaloneServer(server, { listen: { port: 4000 } })');

  console.log('\n--- Example GraphQL Queries ---');

  // 4. Example queries that would work with the generated schema
  const exampleQueries = `
# Query all users with pagination
query GetUsers($limit: Int, $offset: Int) {
  users(limit: $limit, offset: $offset) {
    id
    name
    email
    age
    createdAt
    posts {
      id
      title
      published
    }
    following {
      id
      name
    }
  }
}

# Query single user with nested relations
query GetUser($id: ID!) {
  user(id: $id) {
    id
    name
    email
    posts {
      id
      title
      content
      published
      likedBy {
        id
        name
      }
    }
    following {
      id
      name
      posts {
        id
        title
      }
    }
  }
}

# Query posts with filtering
query GetPublishedPosts($limit: Int) {
  posts(where: { published: true }, limit: $limit) {
    id
    title
    content
    author {
      id
      name
    }
    likedBy {
      id
      name
    }
  }
}

# Mutation: Create user
mutation CreateUser($input: UserCreateInput!) {
  createUser(input: $input) {
    id
    name
    email
  }
}

# Mutation: Create post with author
mutation CreatePost($input: PostCreateInput!, $authorId: ID!) {
  createPost(input: $input) {
    id
    title
    author {
      id
      name
    }
  }
}

# Mutation: Update user
mutation UpdateUser($id: ID!, $input: UserUpdateInput!) {
  updateUser(id: $id, input: $input) {
    id
    name
    age
  }
}

# Mutation: Like a post
mutation LikePost($userId: ID!, $postId: ID!) {
  likePost(userId: $userId, postId: $postId) {
    id
    likedBy {
      id
      name
    }
  }
}

# Aggregation queries
query GetStats {
  userCount
  userAverageAge
  publishedPostCount
}`;

  console.log(exampleQueries);

  // 5. Demonstrate executing GraphQL-like operations via client
  console.log('\n--- Executing GraphQL-like Operations via Client ---');

  // Get user with posts (similar to GraphQL query)
  const userWithPosts = await client.findUnique<UserRow>('User', {
    where: { id: 'gql-user-1' },
    include: { posts: { include: { likedBy: true } }, following: true },
  });
  console.log('\nUser with posts (GraphQL-like):');
  console.log(`  ${userWithPosts?.name}`);
  console.log(`  Posts: ${userWithPosts?.posts?.map((p: any) => p.title).join(', ')}`);
  console.log(`  Following: ${userWithPosts?.following?.map((u: any) => u.name).join(', ')}`);

  // Get posts with author (similar to GraphQL query)
  const postsWithAuthor = await client.findMany<PostRow>('Post', {
    where: { published: true },
    include: { author: true, likedBy: true },
    limit: 10,
  });
  console.log('\nPublished posts with author (GraphQL-like):');
  for (const p of postsWithAuthor) {
    console.log(`  ${p.title} by ${p.author?.name} (${p.likedBy?.length ?? 0} likes)`);
  }

  // 6. Custom resolver example
  console.log('\n--- Custom Resolver Pattern ---');

  // Example of how to add custom fields to GraphQL schema
  const _customResolvers = {
    User: {
      // Custom field: total engagement score
      engagementScore: async (user: UserRow) => {
        const postCount = await client.count('Post', {
          // Would need author relationship to filter
        });
        const likeCount = await client.raw<{ count: number }>(
          `MATCH (u:User {id: $id})-[:LIKES]->() RETURN count(*) as count`,
          { id: user.id },
        );
        return (postCount || 0) * 10 + (likeCount[0]?.count || 0);
      },

      // Custom field: is active user
      isActive: async (user: UserRow) => {
        const recentPosts = await client.raw<{ count: number }>(
          `MATCH (u:User {id: $id})-[:POSTED]->(p:Post)
           WHERE p.createdAt > datetime() - duration('P30D')
           RETURN count(p) as count`,
          { id: user.id },
        );
        return (recentPosts[0]?.count || 0) > 0;
      },
    },
  };

  console.log('Custom resolvers defined for User type:');
  console.log('  - engagementScore: calculates user engagement');
  console.log('  - isActive: checks if user posted in last 30 days');

  // 7. Context-aware resolvers
  console.log('\n--- Context-Aware Resolvers ---');

  // Example of context-based authorization
  const _authResolvers = {
    Query: {
      users: async (_: any, args: any, context: any) => {
        // Check authentication
        if (!context.user) {
          throw new Error('Authentication required');
        }

        // Check authorization
        if (context.user.role !== 'admin') {
          throw new Error('Admin access required');
        }

        return client.findMany<UserRow>('User', {
          limit: args.limit,
          skip: args.offset,
          orderBy: { name: 'asc' },
        });
      },

      me: async (_: any, __: any, context: any) => {
        if (!context.user) return null;
        return client.findUnique<UserRow>('User', { where: { id: context.user.id } });
      },
    },

    Mutation: {
      createUser: async (_: any, { input }: any, context: any) => {
        if (context.user?.role !== 'admin') {
          throw new Error('Admin access required');
        }
        return client.create<UserRow>('User', { data: input });
      },
    },
  };

  console.log('Auth-aware resolvers defined:');
  console.log('  - users: requires admin role');
  console.log('  - me: requires authentication');
  console.log('  - createUser: requires admin role');

  // 8. Subscription pattern (conceptual)
  console.log('\n--- Subscription Pattern (Conceptual) ---');
  console.log(`
# GraphQL Subscriptions for real-time updates
subscription OnUserCreated {
  userCreated {
    id
    name
    email
  }
}

subscription OnPostPublished {
  postPublished {
    id
    title
    author {
      name
    }
  }
}

# Implementation would use PubSub with Neo4j triggers
# or change data capture (CDC)
  `);

  await driver.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
