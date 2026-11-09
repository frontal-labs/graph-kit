// @graph-kit/mcp/src/server/mcp-server.ts
// Graph-Kit MCP server class and factory

import type { AnyDriverConfig, DriverAdapter } from '@graph-kit/sdk';
import { createDriver } from '@graph-kit/sdk';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { MCPConfig } from '../config';
import { RESOURCE_DEFINITIONS, readResource } from '../resources/index';
import { callTool, TOOL_DEFINITIONS, toToolError } from '../tools/index';

export class GraphKitMCPServer {
  private server: Server;
  private driver: DriverAdapter;

  constructor(config: MCPConfig) {
    this.driver =
      'runQuery' in config.driver
        ? (config.driver as DriverAdapter)
        : createDriver(config.driver as AnyDriverConfig);

    this.server = new Server(
      {
        name: config.name ?? 'graph-kit',
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
      tools: TOOL_DEFINITIONS,
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        return await callTool(this.driver, request.params.name, request.params.arguments);
      } catch (error) {
        return toToolError(error);
      }
    });

    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: RESOURCE_DEFINITIONS,
    }));

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;
      return {
        contents: await readResource(uri),
      };
    });
  }

  async start(): Promise<void> {
    // Connect the database first, so tool calls do not fail with driver_not_connected
    await this.driver.connect();
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Graph-Kit MCP Server running on stdio');
  }

  async stop(): Promise<void> {
    await this.server.close();
    await this.driver.disconnect();
  }
}

export async function createMCPServer(config: MCPConfig): Promise<GraphKitMCPServer> {
  const server = new GraphKitMCPServer(config);
  return server;
}
