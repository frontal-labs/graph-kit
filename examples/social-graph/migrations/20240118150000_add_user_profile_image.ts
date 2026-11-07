// 20240118150000_add_user_profile_image.ts
// Add profileImageUrl field to User nodes

import type { Migration } from '@graph-om/core/migration';
import type { QueryCompiler } from '@graph-om/core/query';

export const migration: Migration = {
  version: '20240118150000',
  name: 'add_user_profile_image',
  timestamp: 1705587600000,

  up: (_compiler: QueryCompiler) => {
    return [
      // Add profileImageUrl property with empty string default
      "MATCH (u:User) WHERE u.profileImageUrl IS NULL SET u.profileImageUrl = ''",
    ];
  },

  down: (_compiler: QueryCompiler) => {
    return [
      // Remove profileImageUrl property
      'MATCH (u:User) SET u.profileImageUrl = null',
    ];
  },
};
