// @graph-om/cli/src/index.ts
// CLI entry point

import { formatError } from '@graph-om/sdk/errors';
import { Command } from 'commander';
import { createDiffCommand } from './commands/diff.js';
import { generateCommand } from './commands/generate.js';
import { initCommand } from './commands/init.js';
import { createMigrateCommand } from './commands/migrate.js';
import { createSeedCommand } from './commands/seed.js';
import { createStudioCommand } from './commands/studio.js';

// Injected at build time by tsup; falls back in dev/test.
declare const __GRAPH_OM_CLI_VERSION__: string | undefined;

function readPackageVersion(): string {
  try {
    return typeof __GRAPH_OM_CLI_VERSION__ !== 'undefined' ? __GRAPH_OM_CLI_VERSION__ : '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export function createProgram(): Command {
  const program = new Command();

  program
    .name('graph-om')
    .description('Graph-OM - Prisma-like DX for graph databases')
    .version(readPackageVersion());

  program
    .command('init')
    .description('Initialize a new Graph-OM project')
    .argument('[directory]', 'Project directory', '.')
    .option('--database <type>', 'Database type (neo4j)', 'neo4j')
    .action(initCommand);

  program
    .command('generate')
    .description('Generate types and client from schema')
    .option('--watch', 'Watch mode for auto-generation')
    .action(generateCommand);

  program.addCommand(createMigrateCommand());
  program.addCommand(createSeedCommand());
  program.addCommand(createStudioCommand());
  program.addCommand(createDiffCommand());

  return program;
}

function isExecutedDirectly(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return /[\\/]graph-om$/.test(entry) || /[\\/]index\.(mjs|cjs|js)$/.test(entry);
}

if (isExecutedDirectly()) {
  createProgram()
    .parseAsync()
    .catch((error: unknown) => {
      // `auto` respects NO_COLOR and TTY detection; the CLI has no --no-color flag.
      process.stderr.write(`${formatError(error as Error, { format: 'auto' })}\n`);
      process.exitCode = 1;
    });
}
