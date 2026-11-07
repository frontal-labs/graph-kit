// @graph-om/mcp/src/index.ts
// Graph-OM MCP (Model Context Protocol) server
// Provides graph database operations through MCP protocol

import type { DriverAdapter, DriverConfig } from '@graph-om/sdk';
import { type AnyDriverConfig, createDriver } from '@graph-om/sdk';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

export interface MCPConfig {
  driver: DriverAdapter | DriverConfig;
  name?: string;
  version?: string;
}

export class GraphOMMCPServer {
  private server: Server;
  private driver: DriverAdapter;

  constructor(config: MCPConfig) {
    this.driver =
      'runQuery' in config.driver
        ? (config.driver as DriverAdapter)
        : createDriver(config.driver as AnyDriverConfig);

    this.server = new Server(
      {
        name: config.name ?? 'graph-om',
        version: config.version ?? '1.0.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      },
    );

    this.setupHandlers();
  }

  private setupHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
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
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case 'run_query': {
          const { cypher, params } = args as { cypher: string; params?: Record<string, unknown> };
          const result = await this.driver.runQuery(cypher, params);
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
          // This would need to be implemented based on the driver's capabilities
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  { message: 'Schema introspection not yet implemented' },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        case 'list_nodes': {
          const { label, limit = 100 } = args as { label?: string; limit?: number };
          const cypher = label
            ? `MATCH (n:${label}) RETURN n LIMIT ${limit}`
            : `MATCH (n) RETURN n LIMIT ${limit}`;
          const result = await this.driver.runQuery(cypher);
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
          const result = await this.driver.runQuery(cypher);
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
          throw new Error(`Unknown tool: ${name}`);
      }
    });

    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: [
        {
          uri: 'graph://schema',
          name: 'Graph Schema',
          description: 'Graph database schema',
          mimeType: 'application/json',
        },
      ],
    }));

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;

      if (uri === 'graph://schema') {
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(
                { message: 'Schema introspection not yet implemented' },
                null,
                2,
              ),
            },
          ],
        };
      }

      throw new Error(`Unknown resource: ${uri}`);
    });
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Graph-OM MCP Server running on stdio');
  }

  async stop(): Promise<void> {
    await this.server.close();
  }
}

export async function createMCPServer(config: MCPConfig): Promise<GraphOMMCPServer> {
  const server = new GraphOMMCPServer(config);
  return server;
}

export { Server } from '@modelcontextprotocol/sdk/server/index.js';
export { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
