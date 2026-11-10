// 20240116100000_add_user_bio.ts
// Add bio field to User nodes

import type { Migration } from '@graph-kit/sdk/migration';
import type { QueryCompiler } from '@graph-kit/sdk/query';

export const migration: Migration = {
  version: '20240116100000',
  name: 'add_user_bio',
  timestamp: 1705408800000,

  up: (_compiler: QueryCompiler) => {
    return [
      // Add bio property to existing User nodes with empty string default
      "MATCH (u:User) WHERE u.bio IS NULL SET u.bio = ''",

      // Add index for bio search
      'CREATE INDEX user_bio_index IF NOT EXISTS FOR (u:User) ON (u.bio)',
    ];
  },

  down: (_compiler: QueryCompiler) => {
    return [
      'DROP INDEX user_bio_index IF EXISTS',
      // Remove bio property (set to null)
      'MATCH (u:User) SET u.bio = null',
    ];
  },
};
