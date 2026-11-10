// index.ts - Schema DSL: nodes, properties, relations, indexes
// Run: pnpm start
// Does NOT require a database.

import {
  boolean,
  date,
  defineRel,
  json,
  node,
  number,
  relation,
  schema as sch,
  string,
  uuid,
} from '@graph-kit/sdk';
import type { UserRow } from './schema.js';

// ---------------------------------------------------------------------------
// Node definition
// ---------------------------------------------------------------------------

const User = node('User')
  .add('id', string({ primary: true })) // primary key
  .add('name', string())
  .add('email', string({ unique: true })) // uniqueness constraint
  .add('age', number({ nullable: true })) // nullable
  .add('bio', string({ nullable: true, default: '' }))
  .add('settings', json({ nullable: true })) // arbitrary JSON
  .add('avatarId', uuid({ nullable: true }))
  .add('createdAt', date({ default: () => new Date() })) // default factory
  .add('updatedAt', date({ nullable: true }))
  .add('posts', relation('POSTED', 'OUT', 'Post', { multiple: true }))
  .add('following', relation('FOLLOWS', 'OUT', 'User', { multiple: true }))
  .add('followers', relation('FOLLOWS', 'IN', 'User', { multiple: true }))
  .index(['email'], true) // unique index
  .index(['createdAt']) // non-unique index
  .build();

const Post = node('Post')
  .add('id', string({ primary: true }))
  .add('title', string())
  .add('content', string({ nullable: true }))
  .add('published', boolean({ default: false }))
  .add('tags', string({ array: true })) // array of strings
  .add('createdAt', date({ default: () => new Date() }))
  .add('viewCount', number({ default: 0 }))
  .add('author', relation('POSTED', 'IN', 'User'))
  .add('likedBy', relation('LIKES', 'IN', 'User', { multiple: true }))
  .index(['title'])
  .index(['published'])
  .build();

// ---------------------------------------------------------------------------
// Relation definitions (standalone relation entities with properties)
// ---------------------------------------------------------------------------

const AUTHORED = defineRel('AUTHORED', 'OUT', 'Post', {
  properties: {
    createdAt: date({ default: () => new Date() }),
    weight: number({ default: 1 }),
  },
});

const FOLLOWS = defineRel('FOLLOWS', 'OUT', 'User', {
  properties: {
    since: date(),
  },
});

// ---------------------------------------------------------------------------
// Schema registry
// ---------------------------------------------------------------------------

const graph = sch().add('User', User).add('Post', Post).build();

// ---------------------------------------------------------------------------
// Inspection (the built registry is the nodes map itself)
// ---------------------------------------------------------------------------

function describeNode(nodeConfig: {
  label: string;
  properties: Record<string, unknown>;
  relations: Record<string, unknown>;
}) {
  console.log(`Node: ${nodeConfig.label}`);
  console.log('  Properties:');
  for (const [name, prop] of Object.entries(
    nodeConfig.properties as Record<
      string,
      {
        primary?: boolean;
        unique?: boolean;
        nullable?: boolean;
        array?: boolean;
        default?: unknown;
        type: string;
      }
    >,
  )) {
    const flags = [
      prop.primary ? 'PK' : '',
      prop.unique ? 'UNIQUE' : '',
      prop.nullable ? 'NULLABLE' : '',
      prop.array ? 'ARRAY' : '',
      prop.default !== undefined ? 'DEFAULT' : '',
    ]
      .filter(Boolean)
      .join(' ');
    console.log(`    ${name}: ${prop.type}${flags ? ` (${flags})` : ''}`);
  }

  console.log('  Relations:');
  for (const [name, rel] of Object.entries(
    nodeConfig.relations as Record<string, { type: string; target: string; direction: string }>,
  )) {
    console.log(`    ${name}: ${rel.type} -> ${rel.target} (${rel.direction})`);
  }
}

describeNode(User);
describeNode(Post);

console.log('\nSchema nodes:', Object.keys(graph).join(', '));

// ---------------------------------------------------------------------------
// Type inference
// ---------------------------------------------------------------------------

// Types flow from the schema into your row types:
const _typeCheck: UserRow = {} as UserRow;
void _typeCheck;
void graph;
void AUTHORED;
void FOLLOWS;

console.log('\nSchema definition example complete (no database required).');
