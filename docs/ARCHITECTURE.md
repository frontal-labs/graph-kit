# Architecture

Graph-OM follows a layered architecture inspired by Prisma and Drizzle.

## Layers

### 1. Schema DSL (`packages/core/src/schema`)

User-facing API for defining graph schemas. Uses the builder pattern:

```
node('User') → .add() → .build() → NodeConfig
schema() → .add() → .rel() → .build() → GraphSchemaRegistry
```

### 2. Cypher Compiler (`packages/core/src/query`)

Compiles Graph-OM operations (find, create, update, delete, include) into Cypher queries and parameters. Type-safe via generics over `NodeConfig`.

### 3. Client (`packages/core/src/client`)

`GraphClient` wraps a `DriverAdapter` and schema registry. Provides high-level CRUD methods that delegate to the compiler.

### 4. Driver Adapters (`adapters/`)

Multiple driver adapters implement the `DriverAdapter` interface:

- **Neo4j** (`adapters/neo4j`): Uses the official Neo4j JavaScript driver
- **Memgraph** (`adapters/memgraph`): Uses Neo4j driver with Memgraph-specific configuration
- **FalkorDB** (`adapters/falkordb`): Uses Redis client with RedisGraph protocol
- **ArangoDB** (`adapters/arangodb`): Uses arangojs with AQL

All adapters abstract connection management and query execution behind a common interface.

### 5. CLI (`cli/`)

`@graph-om/cli` provides `graph-om init` (scaffolding) and `graph-om generate` (code generation from schema).

### 6. Zod Integration (`packages/zod`)

Generates zod validation schemas from Graph-OM node configs when `output.zod: true`.

## Data Flow

```
User Schema (schema.ts)
    ↓
graph-om generate
    ↓
Generated Types + Client (src/__generated__/)
    ↓
Application Code
    ↓
GraphClient (driver + schema registry)
    ↓
Cypher/AQL Compiler (query compilation)
    ↓
Driver Adapter (query execution)
    ↓
Graph Database (Neo4j, Memgraph, FalkorDB, ArangoDB, etc.)
```

## Type Safety

- Schema → NodeConfig → TypeScript interfaces (via code generation)
- Queries → CompiledQuery (typed params and results)
- Client methods → Generic over node label, return inferred node shape
- Environment → `env` from `@t3-oss/env-core` + zod (runtime validation)

## Project Structure

```
graph-om/
├── cli/                    # @graph-om/cli — scaffolding + codegen
├── packages/core/          # @graph-om/core — schema, compiler, client, config
├── adapters/
│   ├── neo4j/             # @graph-om/neo4j — Neo4j driver adapter
│   ├── memgraph/          # @graph-om/memgraph — Memgraph driver adapter
│   ├── falkordb/          # @graph-om/falkordb — FalkorDB driver adapter
│   └── arangodb/          # @graph-om/arangodb — ArangoDB driver adapter
├── packages/zod/           # @graph-om/zod — zod validation
├── examples/social-graph/  # End-to-end demo
└── docs/                   # Documentation
```
