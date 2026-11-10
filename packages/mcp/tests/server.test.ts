import { createMockDriver } from '@graph-kit/sdk/testing';
import { describe, expect, it } from 'vitest';
import { createMCPServer, GraphKitMCPServer } from '../src/index.js';

describe('GraphKitMCPServer', () => {
  it('builds a server around a driver adapter instance', () => {
    const server = new GraphKitMCPServer({ driver: createMockDriver(), name: 'test-graph' });
    expect(server).toBeInstanceOf(GraphKitMCPServer);
  });

  it('creates a server through the async factory', async () => {
    const server = await createMCPServer({ driver: createMockDriver() });
    expect(server).toBeInstanceOf(GraphKitMCPServer);
  });
});
