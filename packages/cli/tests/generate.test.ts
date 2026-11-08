// @graph-om/cli/tests/generate.test.ts

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  generateClientContent,
  generateCreateType,
  generateNodeInterface,
  generateTypesContent,
  generateUpdateType,
  generateWhereType,
  generateZodContent,
  loadProjectConfig,
  loadSchema,
  mapPropertyType,
  type NodeDef,
  runGenerate,
} from '../src/commands/generate';

const SCHEMA_FIXTURE = `import { node, relation, schema as sch, string, boolean, date } from '@graph-om/sdk';

export const User = node('User')
  .add('id', string({ primary: true }))
  .add('name', string())
  .add('email', string({ unique: true }))
  .add('bio', string({ nullable: true }))
  .add('createdAt', date({ default: () => new Date() }))
  .add('posts', relation('POSTED', 'OUT', 'Post', { multiple: true }))
  .add('profile', relation('HAS_PROFILE', 'OUT', 'Profile'))
  .build();

export const Post = node('Post')
  .add('id', string({ primary: true }))
  .add('title', string())
  .add('published', boolean({ default: false }))
  .build();

export const graph = sch()
  .add('User', User)
  .add('Post', Post)
  .build();
`;

let tmpDir: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'graph-om-cli-test-'));
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('mapPropertyType', () => {
  it('maps known types', () => {
    expect(mapPropertyType('string')).toBe('string');
    expect(mapPropertyType('number')).toBe('number');
    expect(mapPropertyType('boolean')).toBe('boolean');
    expect(mapPropertyType('date')).toBe('Date');
    expect(mapPropertyType('bigint')).toBe('bigint');
    expect(mapPropertyType('float')).toBe('number');
    expect(mapPropertyType('uuid')).toBe('string');
    expect(mapPropertyType('json')).toBe('unknown');
  });

  it('maps arrays', () => {
    expect(mapPropertyType('string', true)).toBe('string[]');
    expect(mapPropertyType('date', true)).toBe('Date[]');
  });

  it('falls back to unknown', () => {
    expect(mapPropertyType('wat')).toBe('unknown');
  });
});

describe('loadSchema', () => {
  it('extracts nodes, properties, and relations', () => {
    const schemaPath = path.join(tmpDir, 'schema.ts');
    fs.writeFileSync(schemaPath, SCHEMA_FIXTURE);

    const nodes = loadSchema(schemaPath);
    const labels = nodes.map((n) => n.label);
    expect(labels).toEqual(['User', 'Post']);

    const user = nodes.find((n) => n.label === 'User');
    if (!user) throw new Error('User node not found');
    expect(user.properties.map((p) => p.name)).toEqual(['id', 'name', 'email', 'bio', 'createdAt']);
    expect(user.properties.find((p) => p.name === 'id')?.primary).toBe(true);
    expect(user.properties.find((p) => p.name === 'email')?.unique).toBe(true);
    expect(user.properties.find((p) => p.name === 'bio')?.nullable).toBe(true);

    expect(user.relations).toEqual([
      { name: 'posts', type: 'POSTED', direction: 'OUT', target: 'Post', multiple: true },
      {
        name: 'profile',
        type: 'HAS_PROFILE',
        direction: 'OUT',
        target: 'Profile',
        multiple: false,
      },
    ]);
  });

  it('detects multiple per-relation, not node-wide', () => {
    const schemaPath = path.join(tmpDir, 'schema-multi.ts');
    fs.writeFileSync(
      schemaPath,
      `import { node, relation, string } from '@graph-om/sdk';
export const A = node('A')
  .add('id', string({ primary: true }))
  .add('things', relation('HAS', 'OUT', 'B', { multiple: true }))
  .add('thing', relation('OWNS', 'OUT', 'B'))
  .build();
`,
    );
    const [a] = loadSchema(schemaPath);
    expect(a?.relations.find((r) => r.name === 'things')?.multiple).toBe(true);
    expect(a?.relations.find((r) => r.name === 'thing')?.multiple).toBe(false);
  });

  it('excludes labels listed in exclude', () => {
    const schemaPath = path.join(tmpDir, 'schema.ts');
    const nodes = loadSchema(schemaPath, ['Post']);
    expect(nodes.map((n) => n.label)).toEqual(['User']);
  });
});

describe('content generators', () => {
  const node: NodeDef = {
    label: 'User',
    properties: [
      { name: 'id', type: 'string', primary: true },
      { name: 'name', type: 'string' },
      { name: 'bio', type: 'string', nullable: true },
      { name: 'tags', type: 'string', array: true },
    ],
    relations: [
      { name: 'posts', type: 'POSTED', direction: 'OUT', target: 'Post', multiple: true },
      { name: 'profile', type: 'HAS', direction: 'OUT', target: 'Profile', multiple: false },
    ],
  };

  it('generateNodeInterface includes props and relations', () => {
    const out = generateNodeInterface(node);
    expect(out).toContain('export interface UserNode {');
    expect(out).toContain('id: string;');
    expect(out).toContain('bio?: string | null;');
    expect(out).toContain('tags: string[];');
    expect(out).toContain('posts: PostNode[];');
    expect(out).toContain('profile?: ProfileNode | null;');
  });

  it('generateWhereType includes operators and boolean combinators', () => {
    const out = generateWhereType(node);
    expect(out).toContain('export type UserWhereInput = {');
    expect(out).toContain('id?: string | WhereOperator<string>;');
    expect(out).toContain('AND?: UserWhereInput[];');
  });

  it('generateCreateType omits primary and optionalizes nullable', () => {
    const out = generateCreateType(node);
    expect(out).not.toContain('id');
    expect(out).toContain('name: string;');
    expect(out).toContain('bio?: string;');
  });

  it('generateUpdateType optionalizes all fields and widens dates', () => {
    const out = generateUpdateType(node);
    expect(out).toContain('name?: string;');
  });

  it('generateTypesContent is valid-looking TS with WhereOperator import', () => {
    const out = generateTypesContent([node]);
    expect(out).toContain("import type { WhereOperator } from '@graph-om/sdk';");
    expect(out).toContain('export interface UserNode');
    expect(out).toContain('export type UserCreateInput');
  });

  it('generateZodContent emits zod schemas', () => {
    const out = generateZodContent([node]);
    expect(out).toContain("import { z } from 'zod';");
    expect(out).toContain('export const UserSchema = z.object({');
    expect(out).toContain('id: z.string(),');
    expect(out).toContain('bio: z.string().nullable(),');
    expect(out).toContain('tags: z.array(z.string()),');
  });

  it('generateClientContent imports neo4j driver and builds node configs', () => {
    const out = generateClientContent([node]);
    expect(out).toContain("import { createNeo4jDriver } from '@graph-om/sdk/driver/neo4j';");
    expect(out).toContain('export async function createClient');
    expect(out).toContain("label: 'User'");
    expect(out).not.toContain('GraphClient.connect');
  });
});

describe('loadProjectConfig', () => {
  it('uses defaults when no config exists', () => {
    const dir = path.join(tmpDir, 'no-config');
    fs.mkdirSync(dir, { recursive: true });
    const config = loadProjectConfig(dir);
    expect(config.schemaPath).toBe(path.join(dir, 'src', 'schema.ts'));
    expect(config.outputDir).toBe(path.join(dir, 'src', '__generated__'));
    expect(config.zod).toBe(false);
  });

  it('parses graph-om.config.ts via regex', () => {
    const dir = path.join(tmpDir, 'ts-config');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'graph-om.config.ts'),
      `export default {
  schema: './graph/schema.ts',
  output: { directory: './out', zod: true },
  exclude: ['Internal'],
};`,
    );
    const config = loadProjectConfig(dir);
    expect(config.schemaPath).toBe(path.join(dir, 'graph', 'schema.ts'));
    expect(config.outputDir).toBe(path.join(dir, 'out'));
    expect(config.zod).toBe(true);
    expect(config.exclude).toEqual(['Internal']);
  });

  it('parses graph-om.config.json', () => {
    const dir = path.join(tmpDir, 'json-config');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'graph-om.config.json'),
      JSON.stringify({
        schema: './s.ts',
        output: { directory: './gen', zod: true },
        exclude: ['X'],
      }),
    );
    const config = loadProjectConfig(dir);
    expect(config.schemaPath).toBe(path.join(dir, 's.ts'));
    expect(config.zod).toBe(true);
    expect(config.exclude).toEqual(['X']);
  });
});

describe('runGenerate', () => {
  it('generates types, client, and zod files', () => {
    const dir = path.join(tmpDir, 'project');
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'schema.ts'), SCHEMA_FIXTURE);
    fs.writeFileSync(
      path.join(dir, 'graph-om.config.ts'),
      `export default { schema: './src/schema.ts', output: { directory: './src/__generated__', zod: true } };`,
    );

    const result = runGenerate(dir);
    expect(result.files).toEqual(['types.ts', 'client.ts', 'zod.ts']);
    expect(fs.existsSync(path.join(dir, 'src', '__generated__', 'types.ts'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'src', '__generated__', 'client.ts'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'src', '__generated__', 'zod.ts'))).toBe(true);

    const types = fs.readFileSync(path.join(dir, 'src', '__generated__', 'types.ts'), 'utf-8');
    expect(types).toContain('export interface UserNode');
  });

  it('skips zod file when zod is not enabled', () => {
    const dir = path.join(tmpDir, 'project-nozod');
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'schema.ts'), SCHEMA_FIXTURE);

    const result = runGenerate(dir);
    expect(result.files).toEqual(['types.ts', 'client.ts']);
  });

  it('throws a helpful error when schema is missing', () => {
    const dir = path.join(tmpDir, 'project-missing');
    fs.mkdirSync(dir, { recursive: true });
    expect(() => runGenerate(dir)).toThrow(/Schema file not found/);
  });
});
