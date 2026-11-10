// schema.ts - Aggregations example schema
import { date, node, number, schema as sch, string } from '@graph-kit/sdk';

export const User = node('User')
  .add('id', string({ primary: true }))
  .add('name', string())
  .add('age', number({ nullable: true }))
  .add('createdAt', date({ default: () => new Date() }))
  .build();

export const Post = node('Post')
  .add('id', string({ primary: true }))
  .add('title', string())
  .add('published', { type: 'boolean', default: false })
  .add('viewCount', number({ default: 0 }))
  .add('createdAt', date({ default: () => new Date() }))
  .build();

export const graph = sch().add('User', User).add('Post', Post).build();

export type UserRow = {
  id: string;
  name: string;
  age: number | null;
  createdAt: Date;
};

export type PostRow = {
  id: string;
  title: string;
  published: boolean;
  viewCount: number;
  createdAt: Date;
};
