// schema.ts - Social Graph Schema
import { date, node, number, relation, schema as sch, string } from '@graph-kit/sdk';

export const User = node('User')
  .add('id', string({ primary: true }))
  .add('name', string())
  .add('email', string({ unique: true }))
  .add('age', number({ nullable: true }))
  .add('createdAt', date({ default: () => new Date() }))
  .add('posts', relation('POSTED', 'OUT', 'Post', { multiple: true }))
  .add('following', relation('FOLLOWS', 'OUT', 'User', { multiple: true }))
  .add('followers', relation('FOLLOWS', 'IN', 'User', { multiple: true }))
  .add('likedPosts', relation('LIKES', 'OUT', 'Post', { multiple: true }))
  .index(['email'], true)
  .build();

export const Post = node('Post')
  .add('id', string({ primary: true }))
  .add('title', string())
  .add('content', string({ nullable: true }))
  .add('published', { type: 'boolean', default: false })
  .add('createdAt', date({ default: () => new Date() }))
  .add('author', relation('POSTED', 'IN', 'User'))
  .add('likedBy', relation('LIKES', 'IN', 'User', { multiple: true }))
  .build();

export const graph = sch().add('User', User).add('Post', Post).build();
