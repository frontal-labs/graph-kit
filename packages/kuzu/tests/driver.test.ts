import { describe, expect, it } from 'vitest';
import { createKuzuDriver } from '../src/index.js';

describe('Kuzu driver', () => {
  it('reports its capabilities without opening the database', () => {
    const driver = createKuzuDriver({ type: 'kuzu', database: ':memory:' } as never);
    const capabilities = driver.getCapabilities();

    expect(capabilities.transactions).toBe(true);
    expect(capabilities.boltProtocol).toBe(false);
    expect(capabilities.procedures).toEqual([]);
  });
});
