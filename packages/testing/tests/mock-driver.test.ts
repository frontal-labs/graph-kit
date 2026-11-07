import { describe, expect, it } from 'vitest';
import {
  createMockDriver,
  generateRandomBoolean,
  generateRandomEmail,
  generateRandomInt,
  generateRandomString,
  graphMatchers,
} from '../src/index.js';

describe('MockDriverAdapter', () => {
  it('counts how often each query was run', async () => {
    const driver = createMockDriver();
    await driver.runQuery('MATCH (n:User) RETURN n');
    await driver.runQuery('MATCH (n:User) RETURN n');
    await driver.runQuery('MATCH (n:Post) RETURN n');

    expect(driver.getQueryCount('MATCH (n:User) RETURN n')).toBe(2);
    expect(driver.getQueryCount('MATCH (n:Post) RETURN n')).toBe(1);
  });

  it('throws the configured error when set to fail', async () => {
    const driver = createMockDriver();
    driver.setShouldThrow(true, new Error('connection refused'));

    await expect(driver.connect()).rejects.toThrow('connection refused');
  });
});

describe('graphMatchers', () => {
  it('accepts a node object and checks its label when one is given', () => {
    expect(graphMatchers.toBeValidNode({ label: 'User' }, 'User').pass).toBe(true);
    expect(graphMatchers.toBeValidNode({ label: 'Post' }, 'User').pass).toBe(false);
    expect(graphMatchers.toBeValidNode(null).pass).toBe(false);
  });

  it('detects a relation by name', () => {
    expect(graphMatchers.toHaveRelation({ relations: { posts: [] } }, 'posts').pass).toBe(true);
    expect(graphMatchers.toHaveRelation({ relations: {} }, 'posts').pass).toBe(false);
  });

  it('matches Cypher against a string or regular expression pattern', () => {
    expect(graphMatchers.toMatchCypherPattern('MATCH (n:User)', 'MATCH \\(n:User\\)').pass).toBe(
      true,
    );
    expect(graphMatchers.toMatchCypherPattern('MATCH (n:Post)', /User/).pass).toBe(false);
  });
});

describe('random data generators', () => {
  it('stay within their documented ranges', () => {
    for (let i = 0; i < 50; i++) {
      const n = generateRandomInt(5, 10);
      expect(n).toBeGreaterThanOrEqual(5);
      expect(n).toBeLessThanOrEqual(10);
      expect(typeof generateRandomBoolean()).toBe('boolean');
    }
  });

  it('produce strings of the requested length and well-formed emails', () => {
    expect(generateRandomString(12)).toHaveLength(12);
    expect(generateRandomEmail()).toMatch(/^[^@\s]+@[^@\s]+\.[^@\s]+$/);
  });
});
