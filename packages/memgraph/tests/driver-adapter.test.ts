// @graph-om/memgraph/tests/driver-adapter.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemgraphDriverAdapter } from '../src/index';

describe('MemgraphDriverAdapter', () => {
  let adapter: MemgraphDriverAdapter;
  const mockDriver = {
    verifyConnectivity: vi.fn(),
    close: vi.fn(),
    session: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // @ts-expect-error - mocking private driver
    adapter = new MemgraphDriverAdapter({
      uri: 'bolt://localhost:7687',
      username: 'neo4j',
      password: 'password',
      database: 'memgraph',
    });
    // @ts-expect-error - replacing private driver
    adapter.driver = mockDriver;
  });

  it('connect calls verifyConnectivity', async () => {
    mockDriver.verifyConnectivity.mockResolvedValue(undefined);
    await adapter.connect();
    expect(mockDriver.verifyConnectivity).toHaveBeenCalled();
  });

  it('disconnect calls close', async () => {
    mockDriver.close.mockResolvedValue(undefined);
    await adapter.disconnect();
    expect(mockDriver.close).toHaveBeenCalled();
  });

  it('verifyConnectivity returns true on success', async () => {
    mockDriver.verifyConnectivity.mockResolvedValue(undefined);
    const result = await adapter.verifyConnectivity();
    expect(result).toBe(true);
  });

  it('verifyConnectivity returns false on failure', async () => {
    mockDriver.verifyConnectivity.mockRejectedValue(new Error('Connection failed'));
    const result = await adapter.verifyConnectivity();
    expect(result).toBe(false);
  });
});
