// index.ts - toCreateSchema, validateCreate, hooks
// Run: pnpm start
// Does NOT require a database.

import { date, node, number, schema as sch, string } from '@graph-kit/sdk';
import { toCreateSchema, validateCreate, validateUpdate } from '@graph-kit/zod';
import type { z } from 'zod';

// ---------------------------------------------------------------------------
// Define a node config
// ---------------------------------------------------------------------------

const User = node('User')
  .add('id', string({ primary: true }))
  .add('name', string())
  .add('email', string({ unique: true }))
  .add('age', number({ nullable: true }))
  .add('createdAt', date({ default: () => new Date() }))
  .build();

const graph = sch().add('User', User).build();

// ---------------------------------------------------------------------------
// Generate Zod schemas from the node config
// ---------------------------------------------------------------------------

const createSchema = toCreateSchema(User);

// Custom Zod refinement: email must contain "@"
const createSchemaWithRefine = createSchema.refine(
  (data) => String(data.email ?? '').includes('@'),
  {
    message: 'Email must contain "@"',
    path: ['email'],
  },
);

// ---------------------------------------------------------------------------
// validateCreate / validateUpdate
// ---------------------------------------------------------------------------

function show(label: string, result: { success: boolean; data?: unknown; error?: unknown }) {
  if (result.success) {
    console.log(`  ${label}: OK ->`, JSON.stringify(result.data));
  } else {
    console.log(
      `  ${label}: FAILED ->`,
      (result.error as z.ZodError).issues.map((i) => i.message).join(', '),
    );
  }
}

console.log('--- validateCreate ---');
show(
  'valid user',
  validateCreate(User, { id: 'u-1', name: 'Alice', email: 'alice@example.com', age: 28 }),
);
show('missing required name', validateCreate(User, { id: 'u-2', email: 'bob@example.com' }));
const badEmail = createSchemaWithRefine.safeParse({
  id: 'u-3',
  name: 'Bob',
  email: 'bob-example.com',
  age: 30,
});
show('bad email (no @)', badEmail);

console.log('\n--- validateUpdate ---');
show('valid update (partial)', validateUpdate(User, { name: 'Alice Updated' }));
show('update primary key not allowed (id optional)', validateUpdate(User, { id: 'u-1' }));

console.log('\n--- toZodSchema full shape ---');
const fullSchema = createSchema;
console.log('create schema keys:', Object.keys(fullSchema.shape));

void graph;

console.log('\nZod validation example complete (no database required).');
