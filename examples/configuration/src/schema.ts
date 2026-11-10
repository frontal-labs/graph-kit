// schema.ts - Configuration example schema
import { node, schema as sch, string } from '@graph-kit/sdk';

export const User = node('User')
  .add('id', string({ primary: true }))
  .add('name', string())
  .add('email', string({ unique: true }))
  .build();

export const graph = sch().add('User', User).build();
