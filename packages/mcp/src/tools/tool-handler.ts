// @graph-om/mcp/src/tools/tool-handler.ts
// MCP tool definitions and call-tool dispatch logic

import type { DriverAdapter } from '@graph-om/sdk';
import { raiseGraphError } from '@graph-om/sdk/errors';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'run_query',
    description: 'Execute a Cypher query against the graph database',
    inputSchema: {
      type: 'object',
      properties: {
        cypher: { type: 'string', description: 'Cypher query to execute' },
        params: { type: 'object', description: 'Query parameters' },
      },
      required: ['cypher'],
    },
  },
  {
    name: 'get_schema',
    description: 'Get the graph schema information',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'list_nodes',
    description: 'List nodes with optional filtering',
    inputSchema: {
      type: 'object',
      properties: {
        label: { type: 'string', description: 'Node label to filter by' },
        limit: { type: 'number', description: 'Maximum number of nodes to return' },
      },
    },
  },
  {
    name: 'list_relationships',
    description: 'List relationships with optional filtering',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', description: 'Relationship type to filter by' },
        limit: { type: 'number', description: 'Maximum number of relationships to return' },
      },
    },
  },
];

export async function callTool(
  driver: DriverAdapter,
  name: string,
  args: Record<string, unknown> | undefined,
): Promise<CallToolResult> {
  switch (name) {
    case 'run_query': {
      const { cypher, params } = args as { cypher: string; params?: Record<string, unknown> };
      const result = await driver.runQuery(cypher, params);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }

    case 'get_schema': {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ message: 'Schema introspection not yet implemented' }, null, 2),
          },
        ],
      };
    }

    case 'list_nodes': {
      const { label, limit = 100 } = args as { label?: string; limit?: number };
      const cypher = label
        ? `MATCH (n:${label}) RETURN n LIMIT ${limit}`
        : `MATCH (n) RETURN n LIMIT ${limit}`;
      const result = await driver.runQuery(cypher);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }

    case 'list_relationships': {
      const { type, limit = 100 } = args as { type?: string; limit?: number };
      const cypher = type
        ? `MATCH ()-[r:${type}]->() RETURN r LIMIT ${limit}`
        : `MATCH ()-[r]->() RETURN r LIMIT ${limit}`;
      const result = await driver.runQuery(cypher);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }

    default:
      raiseGraphError(`Unknown tool: ${name}`, {
        code: 'not_found',
        statusCode: 404,
        metadata: { tool: name },
      });
  }
}
