// schema.ts - Schema DSL example
// Nodes: User, Post | Relations: AUTHORED, FOLLOWS
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

export const User = node('User')
  .add('id', string({ primary: true }))
  .add('name', string())
  .add('email', string({ unique: true }))
  .add('age', number({ nullable: true }))
  .add('bio', string({ nullable: true, default: '' }))
  .add('settings', json({ nullable: true }))
  .add('avatarId', uuid({ nullable: true }))
  .add('createdAt', date({ default: () => new Date() }))
  .add('updatedAt', date({ nullable: true }))
  .add('posts', relation('POSTED', 'OUT', 'Post', { multiple: true }))
  .add('following', relation('FOLLOWS', 'OUT', 'User', { multiple: true }))
  .add('followers', relation('FOLLOWS', 'IN', 'User', { multiple: true }))
  .index(['email'], true)
  .index(['createdAt'])
  .build();

export const Post = node('Post')
  .add('id', string({ primary: true }))
  .add('title', string())
  .add('content', string({ nullable: true }))
  .add('published', boolean({ default: false }))
  .add('tags', string({ array: true }))
  .add('createdAt', date({ default: () => new Date() }))
  .add('viewCount', number({ default: 0 }))
  .add('author', relation('POSTED', 'IN', 'User'))
  .add('likedBy', relation('LIKES', 'IN', 'User', { multiple: true }))
  .index(['title'])
  .index(['published'])
  .build();

// Standalone relation entity with its own properties (used by the DSL example)
export const AUTHORED = defineRel('AUTHORED', 'OUT', 'Post', {
  properties: {
    createdAt: date({ default: () => new Date() }),
    weight: number({ default: 1 }),
  },
});

export const FOLLOWS = defineRel('FOLLOWS', 'OUT', 'User', {
  properties: {
    since: date(),
  },
});

export const graph = sch().add('User', User).add('Post', Post).build();

export type UserRow = {
  id: string;
  name: string;
  email: string;
  age: number | null;
  bio: string;
  createdAt: Date;
};

export type PostRow = {
  id: string;
  title: string;
  content: string | null;
  published: boolean;
  tags: string[];
  viewCount: number;
  createdAt: Date;
};
