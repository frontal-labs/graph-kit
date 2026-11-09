// schema.ts - Bulk operations example schema
import { date, node, number, schema as sch, string } from '@graph-kit/sdk';

export const User = node('User')
  .add('id', string({ primary: true }))
  .add('name', string())
  .add('email', string({ unique: true }))
  .add('age', number({ nullable: true }))
  .add('createdAt', date({ default: () => new Date() }))
  .index(['email'], true)
  .build();

export const graph = sch().add('User', User).build();

export type UserRow = {
  id: string;
  name: string;
  email: string;
  age: number | null;
  createdAt: Date;
};
