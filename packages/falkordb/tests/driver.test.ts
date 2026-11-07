import { describe, expect, it } from 'vitest';
import { createFalkorDBDriver } from '../src/index.js';

describe('FalkorDB driver', () => {
  const driver = createFalkorDBDriver({
    type: 'falkordb',
    host: 'localhost',
    port: 6379,
    graphName: 'social',
  });

  it('reports only the capabilities FalkorDB supports', () => {
    const capabilities = driver.getCapabilities();

    expect(capabilities.transactions).toBe(false);
    expect(capabilities.boltProtocol).toBe(false);
    expect(capabilities.vectorSearch).toBe(true);
    expect(capabilities.fullTextSearch).toBe(true);
    expect(capabilities.geospatial).toBe(true);
    expect(capabilities.procedures).toEqual(['db.idx.fulltext']);
  });
});
