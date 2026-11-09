// 20240119110000_add_bookmark_relation.ts
// Add BOOKMARKED relationship type

import type { Migration } from '@graph-kit/sdk/migration';
import type { QueryCompiler } from '@graph-kit/sdk/query';

export const migration: Migration = {
  version: '20240119110000',
  name: 'add_bookmark_relation',
  timestamp: 1705664400000,

  up: (_compiler: QueryCompiler) => {
    return [
      // Add constraint for bookmark relationships (optional, for uniqueness)
      'CREATE CONSTRAINT bookmark_unique IF NOT EXISTS FOR ()-[r:BOOKMARKED]-() REQUIRE r.id IS UNIQUE',

      // Add index for bookmark queries
      'CREATE INDEX bookmark_createdat_index IF NOT EXISTS FOR ()-[r:BOOKMARKED]-() ON (r.createdAt)',
    ];
  },

  down: (_compiler: QueryCompiler) => {
    return [
      'DROP CONSTRAINT bookmark_unique IF EXISTS',
      'DROP INDEX bookmark_createdat_index IF EXISTS',
      // Remove all BOOKMARKED relationships
      'MATCH ()-[r:BOOKMARKED]-() DELETE r',
    ];
  },
};
