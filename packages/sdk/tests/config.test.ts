// @metal/core/tests/config.test.ts
import { describe, expect, it } from 'vitest';
import { defineConfig, getDefaultConfig, loadConfig, resolveConfig } from '../src/config';

describe('defineConfig', () => {
  it('returns the config unchanged', () => {
    const config = defineConfig({ schema: './src/schema.ts' });
    expect(config).toEqual({ schema: './src/schema.ts' });
  });
});

describe('resolveConfig', () => {
  it('applies defaults', () => {
    const resolved = resolveConfig({ schema: './src/schema.ts' });
    expect(resolved.output.directory).toBe('./src/__generated__');
    expect(resolved.output.zod).toBe(false);
    expect(resolved.driver.type).toBe('neo4j');
    expect(resolved.driver.uri).toBe('bolt://localhost:7687');
    expect(resolved.driver.username).toBe('neo4j');
    expect(resolved.debug).toBe(false);
    expect(resolved.exclude).toEqual([]);
  });

  it('preserves explicit values', () => {
    const resolved = resolveConfig({
      schema: './graph.ts',
      output: { directory: './out', zod: true },
      driver: { type: 'neo4j', uri: 'bolt://db:7687', username: 'u', password: 'p' },
      debug: true,
      exclude: ['Internal'],
    });
    expect(resolved.output).toEqual({ directory: './out', zod: true });
    expect(resolved.driver.uri).toBe('bolt://db:7687');
    expect(resolved.debug).toBe(true);
    expect(resolved.exclude).toEqual(['Internal']);
  });
});

describe('getDefaultConfig', () => {
  it('returns a valid default config', () => {
    const config = getDefaultConfig();
    expect(config.schema).toBe('./src/schema.ts');
    expect(config.output?.directory).toBe('./src/__generated__');
  });

  it('accepts a custom schema path', () => {
    const config = getDefaultConfig('./custom/schema.ts');
    expect(config.schema).toBe('./custom/schema.ts');
  });
});

describe('loadConfig', () => {
  it('returns null when no config file exists', async () => {
    const config = await loadConfig('/nonexistent-directory-for-metal-tests');
    expect(config).toBeNull();
  });

  it('loads graph-kit.config.json', async () => {
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'graph-kit-config-'));
    try {
      fs.writeFileSync(
        path.join(dir, 'graph-kit.config.json'),
        JSON.stringify({ schema: './my-schema.ts', debug: true }),
      );
      const config = await loadConfig(dir);
      expect(config).toEqual({ schema: './my-schema.ts', debug: true });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
