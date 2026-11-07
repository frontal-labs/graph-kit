// @graph-om/sdk/tests/schema-builder.test.ts
import { describe, expect, it } from 'vitest';
import {
  date,
  defineRel,
  node,
  number,
  property,
  relation,
  schema,
  string,
  uuid,
} from '../src/schema/index';

describe('node', () => {
  it('creates a node with a label', () => {
    const n = node('User').build();
    expect(n.label).toBe('User');
    expect(n.properties).toEqual({});
    expect(n.relations).toEqual({});
  });

  it('adds properties with add()', () => {
    const n = node('User')
      .add('id', string({ primary: true }))
      .add('name', string())
      .add('email', string({ unique: true }))
      .add('age', number({ nullable: true }))
      .build();

    expect(n.properties).toHaveProperty('id');
    expect(n.properties).toHaveProperty('name');
    expect(n.properties).toHaveProperty('email');
    expect(n.properties).toHaveProperty('age');

    expect(n.properties.id?.primary).toBe(true);
    expect(n.properties.id?.type).toBe('string');
    expect(n.properties.email?.unique).toBe(true);
    expect(n.properties.age?.nullable).toBe(true);
  });

  it('adds relations with add()', () => {
    const userNode = node('User')
      .add('id', string({ primary: true }))
      .add('posts', relation('POSTED', 'OUT', 'Post', { multiple: true }))
      .add('following', relation('FOLLOWS', 'OUT', 'User', { multiple: true }))
      .build();

    expect(userNode.relations['posts']).toBeDefined();
    expect(userNode.relations['posts']?.type).toBe('POSTED');
    expect(userNode.relations['posts']?.direction).toBe('OUT');
    expect(userNode.relations['posts']?.target).toBe('Post');
    expect(userNode.relations['posts']?.multiple).toBe(true);

    expect(userNode.relations['following']).toBeDefined();
    expect(userNode.relations['following']?.type).toBe('FOLLOWS');
    expect(userNode.relations['following']?.target).toBe('User');
  });

  it('adds indexes', () => {
    const n = node('User')
      .add('id', string({ primary: true }))
      .add('email', string({ unique: true }))
      .index(['email'], true)
      .index(['id'])
      .build();

    expect(n.indexes).toHaveLength(2);
    expect(n.indexes?.[0]?.fields).toEqual(['email']);
    expect(n.indexes?.[0]?.unique).toBe(true);
    expect(n.indexes?.[1]?.fields).toEqual(['id']);
    expect(n.indexes?.[1]?.unique).toBe(false);
  });

  it('adds constraints', () => {
    const n = node('User')
      .add('id', string({ primary: true }))
      .add('email', string({ unique: true }))
      .constraint(['email'], 'UNIQUE')
      .constraint(['name'], 'EXISTS')
      .build();

    expect(n.constraints).toHaveLength(2);
    expect(n.constraints?.[0]?.fields).toEqual(['email']);
    expect(n.constraints?.[0]?.type).toBe('UNIQUE');
    expect(n.constraints?.[1]?.type).toBe('EXISTS');
  });

  it('supports builder chaining with property types', () => {
    const n = node('Product')
      .add('id', uuid({ primary: true }))
      .add('name', string())
      .add('price', number())
      .add('inStock', property('boolean', { default: true }))
      .add('createdAt', date({ default: () => new Date() }))
      .add('tags', string({ array: true }))
      .build();

    expect(n.properties.id?.type).toBe('uuid');
    expect(n.properties.price?.type).toBe('number');
    expect(n.properties.inStock?.type).toBe('boolean');
    expect(n.properties.createdAt?.type).toBe('date');
    expect(n.properties.tags?.type).toBe('string');
    expect(n.properties.tags?.array).toBe(true);
  });

  it('builds a complete social graph schema', () => {
    const User = node('User')
      .add('id', string({ primary: true }))
      .add('name', string())
      .add('email', string({ unique: true }))
      .add('createdAt', date({ default: () => new Date() }))
      .add('posts', relation('POSTED', 'OUT', 'Post', { multiple: true }))
      .add('following', relation('FOLLOWS', 'OUT', 'User', { multiple: true }))
      .index(['email'])
      .build();

    const Post = node('Post')
      .add('id', string({ primary: true }))
      .add('title', string())
      .add('content', string({ nullable: true }))
      .add('published', property('boolean', { default: false }))
      .add('createdAt', date({ default: () => new Date() }))
      .add('author', relation('POSTED', 'IN', 'User'))
      .build();

    const sch = schema().add('User', User).add('Post', Post).build();

    expect(sch.User).toBeDefined();
    expect(sch.Post).toBeDefined();
    expect(Object.keys(sch)).toHaveLength(2);
  });
});

describe('defineRel', () => {
  it('creates a relation config', () => {
    const rel = defineRel('FOLLOWS', 'OUT', 'User', { multiple: true });

    expect(rel.type).toBe('FOLLOWS');
    expect(rel.direction).toBe('OUT');
    expect(rel.target).toBe('User');
    expect(rel.multiple).toBe(true);
  });

  it('creates a one-to-one relation', () => {
    const rel = defineRel('HAS_PROFILE', 'OUT', 'Profile');

    expect(rel.type).toBe('HAS_PROFILE');
    expect(rel.multiple).toBe(false);
  });

  it('creates an IN direction relation', () => {
    const rel = defineRel('POSTED', 'IN', 'User');

    expect(rel.direction).toBe('IN');
  });
});

describe('property', () => {
  it('returns a PropertyConfig with the given type', () => {
    const prop = property('string');
    expect(prop.type).toBe('string');
  });

  it('includes additional config options', () => {
    const prop = property('string', { primary: true, unique: true, default: 'default' });
    expect(prop.primary).toBe(true);
    expect(prop.unique).toBe(true);
    expect(prop.default).toBe('default');
  });
});

describe('string, number, boolean helpers', () => {
  it('string() creates a string property', () => {
    const prop = string({ primary: true });
    expect(prop.type).toBe('string');
    expect(prop.primary).toBe(true);
  });

  it('number() creates a number property', () => {
    const prop = number({ nullable: true });
    expect(prop.type).toBe('number');
    expect(prop.nullable).toBe(true);
  });

  it('boolean() creates a boolean property', () => {
    const prop = property('boolean', { default: false });
    expect(prop.type).toBe('boolean');
    expect(prop.default).toBe(false);
  });

  it('date() creates a date property', () => {
    const prop = date();
    expect(prop.type).toBe('date');
  });

  it('uuid() creates a uuid property', () => {
    const prop = uuid();
    expect(prop.type).toBe('uuid');
  });
});

describe('schema()', () => {
  it('creates an empty schema', () => {
    const sch = schema().build();
    expect(sch).toEqual({});
  });

  it('builds schema with multiple nodes', () => {
    const User = node('User')
      .add('id', string({ primary: true }))
      .add('name', string())
      .build();

    const Post = node('Post')
      .add('id', string({ primary: true }))
      .add('title', string())
      .add('content', string())
      .build();

    const sch = schema().add('User', User).add('Post', Post).build();

    expect(sch.User).toBe(User);
    expect(sch.Post).toBe(Post);
  });
});
