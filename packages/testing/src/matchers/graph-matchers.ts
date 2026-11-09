// @graph-om/testing/src/matchers/graph-matchers.ts
// Vitest/Jest matchers for Graph-OM

type MatchableNode = { label?: unknown; relations?: Record<string, unknown> } | null | undefined;

export const graphMatchers = {
  toBeValidNode: (node: MatchableNode, expectedLabel?: string) => {
    if (!node || typeof node !== 'object') {
      return { pass: false, message: () => 'Expected a valid node object' };
    }
    if (expectedLabel && node.label !== expectedLabel) {
      return {
        pass: false,
        message: () => `Expected node label ${expectedLabel}, got ${node.label}`,
      };
    }
    return { pass: true, message: () => 'Valid node' };
  },

  toHaveRelation: (node: MatchableNode, relationName: string) => {
    if (!node?.relations?.[relationName]) {
      return {
        pass: false,
        message: () => `Expected node to have relation ${relationName}`,
      };
    }
    return { pass: true, message: () => 'Has relation' };
  },

  toMatchCypherPattern: (cypher: string, pattern: string | RegExp) => {
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    const matches = regex.test(cypher);
    return {
      pass: matches,
      message: () => `Expected Cypher to ${matches ? 'not ' : ''}match pattern`,
    };
  },
};
