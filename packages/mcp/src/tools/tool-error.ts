// @graph-om/mcp/src/tools/tool-error.ts
// Converts errors into client-safe MCP tool error results

import { errorResponse, toPublic } from '@graph-om/sdk/errors';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export function toToolError(error: unknown): CallToolResult {
  const { body } = errorResponse(toPublic(error));
  return { isError: true, content: [{ type: 'text', text: body }] };
}
