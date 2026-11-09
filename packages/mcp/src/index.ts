// @graph-om/mcp/src/index.ts
// Graph-OM MCP (Model Context Protocol) server
// Barrel export - manually selects and re-exports public API

// Re-exports from MCP SDK
export { Server } from '@modelcontextprotocol/sdk/server/index.js';
export { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
// Config
export type { MCPConfig } from './config';
export type { ResourceDefinition } from './resources/index';
// Resources domain
export { RESOURCE_DEFINITIONS, readResource } from './resources/index';
// Server domain
export { createMCPServer, GraphOMMCPServer } from './server/mcp-server';
export type { ToolDefinition } from './tools/index';
// Tools domain
export { callTool, TOOL_DEFINITIONS, toToolError } from './tools/index';
