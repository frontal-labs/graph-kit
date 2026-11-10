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
      // User constraints and indexes
      'CREATE CONSTRAINT user_id_unique IF NOT EXISTS FOR (u:User) REQUIRE u.id IS UNIQUE',
      'CREATE INDEX user_email_index IF NOT EXISTS FOR (u:User) ON (u.email)',
      'CREATE INDEX user_name_index IF NOT EXISTS FOR (u:User) ON (u.name)',
      'CREATE INDEX user_age_index IF NOT EXISTS FOR (u:User) ON (u.age)',

      // Post constraints and indexes
      'CREATE CONSTRAINT post_id_unique IF NOT EXISTS FOR (p:Post) REQUIRE p.id IS UNIQUE',
      'CREATE INDEX post_title_index IF NOT EXISTS FOR (p:Post) ON (p.title)',
      'CREATE INDEX post_published_index IF NOT EXISTS FOR (p:Post) ON (p.published)',
      'CREATE INDEX post_createdat_index IF NOT EXISTS FOR (p:Post) ON (p.createdAt)',

      // Relationship indexes
      'CREATE INDEX posted_relationship_index IF NOT EXISTS FOR ()-[r:POSTED]->() ON (r.createdAt)',
      'CREATE INDEX follows_relationship_index IF NOT EXISTS FOR ()-[r:FOLLOWS]->() ON (r.createdAt)',
      'CREATE INDEX likes_relationship_index IF NOT EXISTS FOR ()-[r:LIKES]->() ON (r.createdAt)',
    ];
  },

  down: (_compiler: QueryCompiler) => {
    return [
      'DROP CONSTRAINT user_id_unique IF EXISTS',
      'DROP INDEX user_email_index IF EXISTS',
      'DROP INDEX user_name_index IF EXISTS',
      'DROP INDEX user_age_index IF EXISTS',
      'DROP CONSTRAINT post_id_unique IF EXISTS',
      'DROP INDEX post_title_index IF EXISTS',
      'DROP INDEX post_published_index IF EXISTS',
      'DROP INDEX post_createdat_index IF EXISTS',
      'DROP INDEX posted_relationship_index IF EXISTS',
      'DROP INDEX follows_relationship_index IF EXISTS',
      'DROP INDEX likes_relationship_index IF EXISTS',
    ];
  },
};
