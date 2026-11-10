// 20240116100000_add_user_bio.ts
// Adds a bio index to User

import type { Migration } from '@graph-kit/sdk/migration';
import type { QueryCompiler } from '@graph-kit/sdk/query';

export const migration: Migration = {
  version: '20240116100000',
  name: 'add_user_bio',
  timestamp: 1705392000000,

  up: (_compiler: QueryCompiler) => {
    return ['CREATE INDEX user_bio_index IF NOT EXISTS FOR (u:User) ON (u.bio)'];
  },

  down: (_compiler: QueryCompiler) => {
    return ['DROP INDEX user_bio_index IF EXISTS'];
  },
};
