// @graph-kit/mcp/src/config.ts
// MCP server configuration

import type { AnyDriverConfig, DriverAdapter } from '@graph-kit/sdk';

export interface MCPConfig {
  driver: DriverAdapter | AnyDriverConfig;
  name?: string;
  version?: string;
}
