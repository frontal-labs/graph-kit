// @graph-om/cli/src/commands/seed.ts
import fs from 'node:fs';
import path from 'node:path';
import { env } from '@graph-om/sdk';
import { createNeo4jDriver } from '@graph-om/sdk/driver/neo4j';
import { parseSchemaFile } from '@graph-om/sdk/schema';
import { createSeedManager } from '@graph-om/sdk/seed';
import { Command } from 'commander';
import { loadProjectConfig } from './generate.js';

interface SeedOptions {
  file?: string;
  count?: number;
  clear?: boolean;
}

export function createSeedCommand(): Command {
  const seed = new Command('seed')
    .description('Database seeding commands')
    .addCommand(createSeedRunCommand())
    .addCommand(createSeedCreateCommand())
    .addCommand(createSeedClearCommand());

  return seed;
}

function createSeedRunCommand(): Command {
  return new Command('run')
    .description('Run seed scripts')
    .argument('[file]', 'Seed file to run (JSON/JS/TS)', 'seed.ts')
    .option('--clear', 'Clear existing data before seeding')
    .action(async (file: string, options: SeedOptions) => {
      await runSeed(file, options.clear ?? false);
    });
}

function createSeedCreateCommand(): Command {
  return new Command('create')
    .description('Create a new seed file template')
    .argument('<name>', 'Seed name (e.g., users, posts)')
    .option('--template <type>', 'Template type (basic, relational)', 'basic')
    .action(async (name: string, options: { template: string }) => {
      await createSeedFile(name, options.template);
    });
}

function createSeedClearCommand(): Command {
  return new Command('clear')
    .description('Clear all seeded data')
    .option('--labels <labels>', 'Comma-separated list of labels to clear')
    .action(async (options: { labels?: string }) => {
      await clearSeed(options.labels?.split(',') || []);
    });
}

async function runSeed(file: string, clear: boolean): Promise<void> {
  const projectRoot = process.cwd();
  const config = loadProjectConfig(projectRoot);
  const { schemaPath } = config;

  const fullPath = path.resolve(projectRoot, file);

  if (!fs.existsSync(fullPath)) {
    console.error(`Seed file not found: ${fullPath}`);
    process.exit(1);
  }

  const result = parseSchemaFile(schemaPath);
  const schema = result.schema;

  const driver = createNeo4jDriver({
    type: 'neo4j',
    uri: env.NEO4J_URI,
    username: env.NEO4J_USER,
    password: env.NEO4J_PASSWORD,
  });
  await driver.connect();

  const seedManager = createSeedManager({ driver, schema });

  try {
    if (clear) {
      console.log('Clearing existing data...');
      await seedManager.clearAll();
    }

    // Load seed file
    const seedModule = await import(fullPath);
    const seedData = seedModule.default ?? seedModule.seedData ?? seedModule;

    if (typeof seedData === 'function') {
      // It's a factory function
      const data = await seedData(seedManager);
      if (data) {
        const results = await seedManager.seed(data);
        printSeedResults(results);
      }
    } else if (Array.isArray(seedData)) {
      // It's an array of seed operations
      for (const op of seedData) {
        if (op.type === 'factory' && op.label && op.count) {
          const factory = seedManager.getRegisteredFactories().includes(op.label)
            ? undefined
            : op.factory;
          if (factory) {
            seedManager.registerFactory(op.label, factory);
          }
          const results = await seedManager.seedWithFactories({ [op.label]: op.count });
          printSeedResults(results);
        }
      }
    } else {
      // Assume it's seed data object
      const results = await seedManager.seed(seedData);
      printSeedResults(results);
    }
  } finally {
    await driver.disconnect();
  }
}

async function createSeedFile(name: string, template: string): Promise<void> {
  const projectRoot = process.cwd();
  const seedDir = path.join(projectRoot, 'prisma', 'seed');
  fs.mkdirSync(seedDir, { recursive: true });

  const fileName = `${name}.ts`;
  const filePath = path.join(seedDir, fileName);

  let content: string;

  if (template === 'relational') {
    content = `// Seed: ${name}
// Relational seed with factories

import { createSeedManager, Fixtures, createUserFactory, createPostFactory } from '@graph-om/sdk/seed';
import { createNeo4jDriver } from '@graph-om/sdk/driver/neo4j';
import { env } from '@graph-om/sdk';
import { parseSchemaFile } from '@graph-om/sdk/schema';

const schemaPath = './src/schema.ts';
const result = parseSchemaFile(schemaPath);
const schema = result.schema;

const driver = createNeo4jDriver({
    type: 'neo4j',
  uri: env.NEO4J_URI,
  username: env.NEO4J_USER,
  password: env.NEO4J_PASSWORD,
});
await driver.connect();

const seedManager = createSeedManager({ driver, schema });

// Register factories
seedManager.registerFactory('User', createUserFactory());
seedManager.registerFactory('Post', createPostFactory());

// Seed with factories - creates 100 users and 500 posts
const results = await seedManager.seedWithFactories({
  User: 100,
  Post: 500,
});

console.log('Seed results:', results);

await driver.disconnect();
`;
  } else {
    content = `// Seed: ${name}
// Basic seed data

export const seedData = {
  User: [
    { id: '1', name: 'Alice', email: 'alice@example.com', createdAt: new Date() },
    { id: '2', name: 'Bob', email: 'bob@example.com', createdAt: new Date() },
    { id: '3', name: 'Charlie', email: 'charlie@example.com', createdAt: new Date() },
  ],
  Post: [
    { id: '1', title: 'Getting Started', content: 'Welcome to Metal!', published: true },
    { id: '2', title: 'Advanced Queries', content: 'Deep dive into Cypher', published: false },
  ],
};
`;
  }

  fs.writeFileSync(filePath, content);
  console.log(`✓ Created seed file: ${filePath}`);
}

async function clearSeed(labels: string[]): Promise<void> {
  const projectRoot = process.cwd();
  const config = loadProjectConfig(projectRoot);
  const { schemaPath } = config;

  const result = parseSchemaFile(schemaPath);
  const schema = result.schema;

  const driver = createNeo4jDriver({
    type: 'neo4j',
    uri: env.NEO4J_URI,
    username: env.NEO4J_USER,
    password: env.NEO4J_PASSWORD,
  });
  await driver.connect();

  const seedManager = createSeedManager({ driver, schema });

  try {
    const targetLabels = labels.length > 0 ? labels : Object.keys(schema);
    console.log(`Clearing labels: ${targetLabels.join(', ')}`);

    for (const label of targetLabels) {
      const count = await seedManager.clearLabel(label);
      console.log(`  Cleared ${count} ${label} nodes`);
    }
  } finally {
    await driver.disconnect();
  }
}

function printSeedResults(
  results: Array<{ label: string; created: number; failed: number }>,
): void {
  console.log('\nSeed Results:');
  console.log('────────────────────────────────────────');
  for (const result of results) {
    const status = result.failed > 0 ? '⚠' : '✓';
    console.log(
      `${status} ${result.label}: ${result.created} created${result.failed > 0 ? `, ${result.failed} failed` : ''}`,
    );
  }
  console.log('');
}
