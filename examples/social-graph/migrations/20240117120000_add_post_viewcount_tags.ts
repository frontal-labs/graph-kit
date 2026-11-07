// 20240117120000_add_post_viewcount_tags.ts
// Add viewCount and tags fields to Post nodes

import type { Migration } from '@graph-om/core/migration';
import type { QueryCompiler } from '@graph-om/core/query';

export const migration: Migration = {
  version: '20240117120000',
  name: 'add_post_viewcount_tags',
  timestamp: 1705492800000,

  up: (_compiler: QueryCompiler) => {
    return [
      // Add viewCount property with default 0
      'MATCH (p:Post) WHERE p.viewCount IS NULL SET p.viewCount = 0',

      // Add tags array property (empty array default)
      'MATCH (p:Post) WHERE p.tags IS NULL SET p.tags = []',

      // Index for viewCount (for popular posts queries)
      'CREATE INDEX post_viewcount_index IF NOT EXISTS FOR (p:Post) ON (p.viewCount)',
    ];
  },

  down: (_compiler: QueryCompiler) => {
    return [
      'DROP INDEX post_viewcount_index IF EXISTS',
      'MATCH (p:Post) SET p.viewCount = null, p.tags = null',
    ];
  },
};
