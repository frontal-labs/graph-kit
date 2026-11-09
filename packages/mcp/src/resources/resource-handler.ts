// @graph-kit/mcp/src/resources/resource-handler.ts
// MCP resource definitions and read-resource dispatch logic

import { raiseGraphError } from '@graph-kit/sdk/errors';

export interface ResourceDefinition {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

export const RESOURCE_DEFINITIONS: ResourceDefinition[] = [
  {
    uri: 'graph://schema',
    name: 'Graph Schema',
    description: 'Graph database schema',
    mimeType: 'application/json',
  },
];

export async function readResource(
  uri: string,
): Promise<Array<{ uri: string; mimeType: string; text: string }>> {
  if (uri === 'graph://schema') {
    return [
      {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify({ message: 'Schema introspection not yet implemented' }, null, 2),
      },
    ];
  }

  raiseGraphError(`Unknown resource: ${uri}`, {
    code: 'not_found',
    statusCode: 404,
    metadata: { uri },
  });
}
