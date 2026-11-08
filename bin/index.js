#!/usr/bin/env node
// Root launcher for the graph-om CLI. It runs the built CLI from packages/cli, so the
// command works from the repository root on macOS, Linux and Windows.
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const [major] = process.versions.node.split('.').map(Number);
if (major < 22) {
  console.error(`graph-om needs Node.js 22 or newer; this is ${process.versions.node}.`);
  process.exit(1);
}

const cliEntry = path.resolve(__dirname, '..', 'packages', 'cli', 'dist', 'index.mjs');

if (!fs.existsSync(cliEntry)) {
  console.error(`graph-om: the CLI is not built yet (missing ${cliEntry}).`);
  console.error('Run "pnpm build" from the repository root, then try again.');
  process.exit(1);
}

// The CLI is an ES module. A file URL keeps Windows drive letters valid for import().
// The CLI runs itself when argv[1] ends in index.js, which this launcher is.
import(pathToFileURL(cliEntry).href).catch((error) => {
  console.error(error);
  process.exit(1);
});
