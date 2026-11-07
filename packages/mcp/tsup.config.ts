import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  external: ['@modelcontextprotocol/sdk', '@graph-om/sdk'],
  banner: {
    js: '// @graph-om/mcp - Graph-OM MCP (Model Context Protocol) server',
  },
});
