import { createMockDriver } from '@graph-kit/sdk/testing';
import { describe, expect, it } from 'vitest';
import { type Migration, MigrationRunner } from '../src/index.js';

function migration(version: string, name: string): Migration {
  return {
    version,
    name,
    timestamp: Number(version),
    up: () => [`CREATE (:Marker {step: '${name}-up'})`],
    down: () => [`MATCH (m:Marker {step: '${name}-up'}) DELETE m`],
  };
}

describe('MigrationRunner', () => {
  it('applies only pending migrations, in the order given', async () => {
    const driver = createMockDriver();
    const runner = new MigrationRunner({ driver });
    const first = migration('20240101000000', 'first');
    const second = migration('20240102000000', 'second');

    const applied = await runner.migrate([first, second]);

    expect(applied.map((m) => m.name)).toEqual(['first', 'second']);
    const cypher = driver.getQueryLog().map((entry) => entry.query);
    const firstAt = cypher.findIndex((q) => q.includes('first-up'));
    const secondAt = cypher.findIndex((q) => q.includes('second-up'));
    expect(firstAt).toBeGreaterThanOrEqual(0);
    expect(firstAt).toBeLessThan(secondAt);
  });

  it('refuses to roll back an applied migration whose definition was not provided', async () => {
    const driver = createMockDriver();
    const runner = new MigrationRunner({ driver });
    // Record the migration as applied without providing its definition afterwards
    await runner.migrate([migration('20240101000000', 'first')]);
    driver.clearQueryLog();

    await expect(runner.rollback([], 1)).rejects.toThrow(
      'Cannot roll back migration 20240101000000: no matching definition provided',
    );
    // Nothing is reverted when the definition is missing
    expect(driver.getQueryLog().some((entry) => entry.query.includes('DELETE m'))).toBe(false);
  });
});
