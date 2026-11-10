# @graph-kit/mcp

Graph-Kit MCP (Model Context Protocol) server. Exposes graph database operations (run Cypher queries, inspect schema, list nodes and relationships) through the [Model Context Protocol](https://modelcontextprotocol.io/) so AI assistants and MCP clients can interact with your Graph-Kit-backed graph database.

## Installation

```bash
pnpm add @graph-kit/mcp @graph-kit/sdk
```

`@modelcontextprotocol/sdk` is a direct dependency and is installed automatically.

## Quick start

```ts
import { createMCPServer } from '@graph-kit/mcp';
import { createNeo4jDriver } from '@graph-kit/sdk/driver/neo4j';

const driver = createNeo4jDriver({
  uri: 'bolt://localhost:7687',
  username: 'neo4j',
  password: 'password',
});

await driver.connect();

const server = await createMCPServer({
  driver,
  name: 'graph-kit',
  version: '1.0.0',
});

await server.start(); // stdio transport
// ... later
await server.stop();
```

You can also pass a raw driver config object instead of an initialized adapter:

```ts
const server = await createMCPServer({
  driver: {
    type: 'neo4j',
    uri: 'bolt://localhost:7687',
    username: 'neo4j',
    password: 'password',
  },
});
```

## API

### `GraphKitMCPServer`

Class wrapping an MCP `Server` over stdio. Methods:

| Method | Description |
|--------|-------------|
| `start()` | Connect a `StdioServerTransport` and begin serving |
| `stop()` | Close the MCP server |

### `createMCPServer(config)`

Factory that constructs and configures a `GraphKitMCPServer` with tool, resource, and call handlers.

```ts
export async function createMCPServer(config: MCPConfig): Promise<GraphKitMCPServer>;
```

### `MCPConfig`

| Field | Type | Description |
|-------|------|-------------|
| `driver` | `DriverAdapter \| DriverConfig` | Graph-Kit driver adapter or config object |
| `name` | string | Server name (default: `'graph-kit'`) |
| `version` | string | Server version (default: `'1.0.0'`) |

## MCP capabilities

### Tools

| Tool | Description | Inputs |
|------|-------------|--------|
| `run_query` | Execute a Cypher query against the graph database | `cypher` (string, required), `params` (object) |
| `get_schema` | Get graph schema information | none |
| `list_nodes` | List nodes with optional label filter and limit | `label` (string), `limit` (number, default 100) |
| `list_relationships` | List relationships with optional type filter and limit | `type` (string), `limit` (number, default 100) |

### Resources

| URI | Description | MIME type |
|-----|-------------|-----------|
| `graph://schema` | Graph database schema | `application/json` |

Schema introspection is not yet implemented and returns a placeholder message.

## Notes

- The server runs on stdio (`StdioServerTransport`), suitable for MCP clients such as Claude Desktop, Cursor, or Continue.
- `get_schema` and the `graph://schema` resource return a "not yet implemented" placeholder.

## License

Apache 2.0
