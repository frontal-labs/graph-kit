// @graph-om/mcp/src/config.ts
// MCP server configuration

import type { AnyDriverConfig, DriverAdapter } from '@graph-om/sdk';

export interface MCPConfig {
  driver: DriverAdapter | AnyDriverConfig;
  name?: string;
  version?: string;
}
