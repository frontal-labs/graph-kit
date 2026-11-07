# Contributing to Graph-OM

Thanks for your interest in contributing!

## Getting started

```bash
git clone https://github.com/frontal-labs/graph-om.git
cd graph-om
pnpm install
pnpm build
pnpm test
```

Requirements: **Node.js ≥ 20** and **pnpm 9** (`corepack enable` recommended).

## Workflow

1. Create a feature branch from `master`.
2. Make your changes with tests.
3. Run the full gate before opening a PR:

   ```bash
   pnpm lint
   pnpm typecheck
   pnpm test
   pnpm build
   ```

4. Add a changeset for user-facing changes:

   ```bash
   pnpm changeset
   ```

## Project layout

- `packages/core` — schema DSL, Cypher compiler, client, config
- `cli` — `graph-om init` / `graph-om generate`
- `adapters/neo4j` — Neo4j `DriverAdapter`
- `adapters/memgraph` — Memgraph `DriverAdapter`
- `adapters/falkordb` — FalkorDB `DriverAdapter`
- `adapters/arangodb` — ArangoDB `DriverAdapter`
- `packages/zod` — Zod validation integration
- `examples/social-graph` — end-to-end example app

## Code style

- TypeScript strict mode; tests are typechecked too.
- Biome + Ultracite. `pnpm format` before committing.
- Prefer pure functions in the query compiler — every compile method should be unit-tested with string/param assertions.
- No `any` in public APIs; internal `any` is tolerated but minimize it.

## Reporting bugs

Open an issue with a minimal reproduction. For security issues, see [SECURITY.md](./SECURITY.md).
