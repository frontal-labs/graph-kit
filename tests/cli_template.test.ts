// @graph-kit/tests/cli_template.test.ts
// Cross-reference test: validates CLI generated output references @graph-kit/sdk env correctly

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('CLI generated output cross-references', () => {
  const cliSrc = path.join(process.cwd(), 'packages/cli/src/commands');

  it('init.ts template imports env from @graph-kit/sdk', () => {
    const initContent = fs.readFileSync(path.join(cliSrc, 'init.ts'), 'utf-8');

    // The generated src/index.ts template should import env
    expect(initContent).toContain("import { GraphClient, env } from '@graph-kit/sdk';");
    // Should use env.NEO4J_* not process.env.NEO4J_*
    expect(initContent).toContain('uri: env.NEO4J_URI');
    expect(initContent).toContain('username: env.NEO4J_USER');
    expect(initContent).toContain('password: env.NEO4J_PASSWORD');
    // Should NOT use process.env directly in templates
    expect(initContent).not.toContain("process.env.NEO4J_URI || 'bolt://");
  });

  it('generate.ts createClient template imports env from @graph-kit/sdk', () => {
    const generateContent = fs.readFileSync(path.join(cliSrc, 'generate.ts'), 'utf-8');

    // The generated client.ts template should import env
    expect(generateContent).toContain("import { GraphClient, env } from '@graph-kit/sdk';");
    // Should use env.NEO4J_* as defaults
    expect(generateContent).toContain('uri: config.uri || env.NEO4J_URI');
    expect(generateContent).toContain('username: config.username || env.NEO4J_USER');
    expect(generateContent).toContain('password: config.password || env.NEO4J_PASSWORD');
  });

  it('cli package.json has correct name and bin', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'packages/cli/package.json'), 'utf-8'),
    );

    expect(pkg.name).toBe('@graph-kit/cli');
    expect(pkg.bin?.['graph-kit']).toBe('./dist/index.mjs');
  });
});
