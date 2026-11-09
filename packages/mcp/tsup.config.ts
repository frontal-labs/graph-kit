import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: false,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  external: ['@modelcontextprotocol/sdk', '@graph-kit/sdk'],
  banner: {
    js: '// @graph-kit/mcp - Graph-Kit MCP (Model Context Protocol) server',
  },
});
