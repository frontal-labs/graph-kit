// schema.ts - Path traversal example schema
import { date, node, relation, schema as sch, string } from '@graph-kit/sdk';

export const User = node('User')
  .add('id', string({ primary: true }))
  .add('name', string())
  .add('createdAt', date({ default: () => new Date() }))
  .add('following', relation('FOLLOWS', 'OUT', 'User', { multiple: true }))
  .add('followers', relation('FOLLOWS', 'IN', 'User', { multiple: true }))
  .build();

export const graph = sch().add('User', User).build();

export type UserRow = {
  id: string;
  name: string;
  createdAt: Date;
};
