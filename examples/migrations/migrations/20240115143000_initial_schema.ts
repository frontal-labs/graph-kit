// 20240115143000_initial_schema.ts
// Initial schema migration - creates constraints and indexes

import type { Migration } from '@graph-kit/sdk/migration';
import type { QueryCompiler } from '@graph-kit/sdk/query';

export const migration: Migration = {
  version: '20240115143000',
  name: 'initial_schema',
  timestamp: 1705329000000,

  up: (_compiler: QueryCompiler) => {
    return [
      'CREATE CONSTRAINT user_id_unique IF NOT EXISTS FOR (u:User) REQUIRE u.id IS UNIQUE',
      'CREATE CONSTRAINT user_email_unique IF NOT EXISTS FOR (u:User) REQUIRE u.email IS UNIQUE',
      'CREATE INDEX user_email_index IF NOT EXISTS FOR (u:User) ON (u.email)',
      'CREATE INDEX user_name_index IF NOT EXISTS FOR (u:User) ON (u.name)',
      'CREATE INDEX user_age_index IF NOT EXISTS FOR (u:User) ON (u.age)',
      'CREATE INDEX user_createdat_index IF NOT EXISTS FOR (u:User) ON (u.createdAt)',
    ];
  },

  down: (_compiler: QueryCompiler) => {
    return [
      'DROP INDEX user_createdat_index IF EXISTS',
      'DROP INDEX user_age_index IF EXISTS',
      'DROP INDEX user_name_index IF EXISTS',
      'DROP INDEX user_email_index IF EXISTS',
      'DROP CONSTRAINT user_email_unique IF EXISTS',
      'DROP CONSTRAINT user_id_unique IF EXISTS',
    ];
  },
};
