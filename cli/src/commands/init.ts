// @graph-om/cli/src/commands/init.ts
import fs from 'node:fs';
import path from 'node:path';

interface InitOptions {
  database: string;
}

export async function initCommand(directory: string, _options: InitOptions): Promise<void> {
  const targetDir = path.resolve(process.cwd(), directory);

  if (fs.existsSync(targetDir) && fs.readdirSync(targetDir).length > 0) {
    console.error(`Error: Directory "${targetDir}" is not empty.`);
    process.exit(1);
  }

  fs.mkdirSync(targetDir, { recursive: true });

  const packageJson = {
    name: path.basename(targetDir),
    version: '1.0.0',
    private: true,
    type: 'module',
    scripts: {
      generate: 'graph-om generate',
      build: 'graph-om generate && tsc --noEmit',
      start: 'tsx src/index.ts',
      typecheck: 'tsc --noEmit',
    },
    dependencies: {
      '@graph-om/core': 'latest',
      '@graph-om/neo4j': 'latest',
    },
    devDependencies: {
      '@graph-om/cli': 'latest',
      typescript: '^5.3.0',
      tsx: '^4.0.0',
      '@types/node': '^20.0.0',
    },
  };

  fs.writeFileSync(
    path.join(targetDir, 'package.json'),
    `${JSON.stringify(packageJson, null, 2)}\n`,
  );

  const tsconfig = {
    compilerOptions: {
      target: 'ES2022',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      strict: true,
      esModuleInterop: true,
      outDir: './dist',
      rootDir: './src',
    },
    include: ['src'],
  };

  fs.writeFileSync(path.join(targetDir, 'tsconfig.json'), `${JSON.stringify(tsconfig, null, 2)}\n`);

  fs.mkdirSync(path.join(targetDir, 'src'), { recursive: true });

  const schemaContent = `// graph-om/schema.ts - Define your graph schema
import { node, defineRel, schema as sch, string, number, date } from '@graph-om/core';

export const User = node('User')
  .add('id', string({ primary: true }))
  .add('name', string())
  .add('email', string({ unique: true }))
  .add('createdAt', date({ default: () => new Date() }))
  .build();

export const graph = sch()
  .add('User', User)
  .build();
`;

  fs.writeFileSync(path.join(targetDir, 'src', 'schema.ts'), schemaContent);

  const mainContent = `// src/index.ts
import { GraphClient, env } from '@graph-om/core';
import { createNeo4jDriver } from '@graph-om/neo4j';
import { graph } from './schema.js';

async function main() {
  const driver = createNeo4jDriver({
    uri: env.NEO4J_URI,
    username: env.NEO4J_USER,
    password: env.NEO4J_PASSWORD,
  });
  await driver.connect();

  const client = new GraphClient(driver, graph);

  const users = await client.findMany('User', { limit: 10 });
  console.log('Users:', users);

  await client.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
`;

  fs.writeFileSync(path.join(targetDir, 'src', 'index.ts'), mainContent);

  // Generate graph-om.config.ts — the single source of truth for Graph-OM
  const graphOmConfigContent = `import { defineConfig, env } from '@graph-om/core';

export default defineConfig({
  schema: './src/schema.ts',
  output: {
    directory: './src/__generated__',
    zod: false,
  },
  driver: {
    type: 'neo4j',
    uri: env.NEO4J_URI,
    username: env.NEO4J_USER,
    password: env.NEO4J_PASSWORD,
  },
  debug: false,
});
`;

  fs.writeFileSync(path.join(targetDir, 'graph-om.config.ts'), graphOmConfigContent);

  const envContent = `NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password
`;
  fs.writeFileSync(path.join(targetDir, '.env.example'), envContent);

  console.log(`\n✓ Initialized Graph-OM project in "${targetDir}"`);
  console.log('\nNext steps:');
  console.log(`  1. cd ${directory}`);
  console.log('  2. Install dependencies (pnpm install / npm install / yarn)');
  console.log('  3. Copy .env.example to .env and set your Neo4j connection');
  console.log('  4. Edit src/schema.ts to define your graph');
  console.log('  5. npx graph-om generate');
  console.log('  6. npx tsx src/index.ts\n');
}
