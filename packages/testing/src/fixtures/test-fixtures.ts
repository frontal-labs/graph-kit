// @graph-kit/testing/src/fixtures/test-fixtures.ts
// Test fixtures and data generation helpers

export interface TestFixture {
  name: string;
  data: Record<string, unknown>[];
}

export function createTestFixtures(): {
  createUserFactory: () => (index: number) => Record<string, unknown>;
  createPostFactory: () => (index: number) => Record<string, unknown>;
  createRelationFactory: () => (
    fromId: string,
    toId: string,
    type: string,
  ) => Record<string, unknown>;
} {
  return {
    createUserFactory: () => {
      const _counter = 0;
      return (index: number) => ({
        id: `user-${index}`,
        name: `User ${index}`,
        email: `user${index}@example.com`,
        age: 20 + (index % 50),
        createdAt: new Date(),
      });
    },
    createPostFactory: () => {
      const _counter = 0;
      return (index: number) => ({
        id: `post-${index}`,
        title: `Post ${index}`,
        content: `Content for post ${index}`,
        published: index % 2 === 0,
        createdAt: new Date(),
      });
    },
    createRelationFactory: () => {
      return (fromId: string, toId: string, type: string) => ({
        from: fromId,
        to: toId,
        type,
        createdAt: new Date(),
      });
    },
  };
}

export function generateTestData<T>({
  count,
  factory,
}: {
  count: number;
  factory: (index: number) => T;
}): T[] {
  return Array.from({ length: count }, (_, i) => factory(i));
}
