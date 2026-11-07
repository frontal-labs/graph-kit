import { createMockDriver } from '@graph-om/sdk/testing';
import { describe, expect, it } from 'vitest';
import { createMCPServer, GraphOMMCPServer } from '../src/index.js';

describe('GraphOMMCPServer', () => {
  it('builds a server around a driver adapter instance', () => {
    const server = new GraphOMMCPServer({ driver: createMockDriver(), name: 'test-graph' });
    expect(server).toBeInstanceOf(GraphOMMCPServer);
  });

  it('creates a server through the async factory', async () => {
    const server = await createMCPServer({ driver: createMockDriver() });
    expect(server).toBeInstanceOf(GraphOMMCPServer);
  });
});
