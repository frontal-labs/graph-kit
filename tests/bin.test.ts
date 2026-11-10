// tests/bin.test.ts - the root launcher runs the built CLI
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const launcher = path.resolve(__dirname, '..', 'bin', 'index.js');
const cliVersion = require('../packages/cli/package.json').version as string;

describe('root bin/index.js', () => {
  it('runs the CLI and reports its version', () => {
    const out = execFileSync(process.execPath, [launcher, '--version'], { encoding: 'utf8' });
    expect(out.trim()).toBe(cliVersion);
  }, 30_000);

  it('shows the CLI help', () => {
    const out = execFileSync(process.execPath, [launcher, '--help'], { encoding: 'utf8' });
    expect(out).toContain('Usage: graph-kit');
  }, 30_000);
});
