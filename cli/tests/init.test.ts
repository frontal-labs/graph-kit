// @graph-om/cli/tests/init.test.ts

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { initCommand } from '../src/commands/init';

let tmpDir: string;
let projectDir: string;

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'graph-om-init-test-'));
  projectDir = path.join(tmpDir, 'my-app');
  const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
    throw new Error('process.exit');
  }) as never);
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  await initCommand(projectDir, { database: 'neo4j' });
  exitSpy.mockRestore();
  logSpy.mockRestore();
  errorSpy.mockRestore();
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('initCommand', () => {
  it('scaffolds the expected files', () => {
    expect(fs.existsSync(path.join(projectDir, 'package.json'))).toBe(true);
    expect(fs.existsSync(path.join(projectDir, 'tsconfig.json'))).toBe(true);
    expect(fs.existsSync(path.join(projectDir, 'graph-om.config.ts'))).toBe(true);
    expect(fs.existsSync(path.join(projectDir, '.env.example'))).toBe(true);
    expect(fs.existsSync(path.join(projectDir, 'src', 'schema.ts'))).toBe(true);
    expect(fs.existsSync(path.join(projectDir, 'src', 'index.ts'))).toBe(true);
  });

  it('writes a package.json with graph-om dependencies and scripts', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(projectDir, 'package.json'), 'utf-8'));
    expect(pkg.name).toBe('my-app');
    expect(pkg.dependencies['@graph-om/sdk']).toBeDefined();
    expect(pkg.dependencies['@graph-om/neo4j']).toBeDefined();
    expect(pkg.devDependencies['@graph-om/cli']).toBeDefined();
    expect(pkg.scripts.generate).toBe('graph-om generate');
  });

  it('does not call the nonexistent GraphClient.connect', () => {
    const main = fs.readFileSync(path.join(projectDir, 'src', 'index.ts'), 'utf-8');
    expect(main).not.toContain('GraphClient.connect');
    expect(main).toContain('createNeo4jDriver');
    expect(main).toContain('new GraphClient(driver, graph)');
  });

  it('refuses to init into a non-empty directory', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit');
    }) as never);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(initCommand(projectDir, { database: 'neo4j' })).rejects.toThrow('process.exit');
    expect(errorSpy).toHaveBeenCalled();
    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
