# Contributing Guide

## Getting Started

```bash
git clone https://github.com/frontal-labs/graph-om.git
cd graph-om
pnpm install
pnpm build
pnpm test
```

Requirements: Node.js ≥ 20, pnpm 9 (`corepack enable` recommended).

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

5. Open a pull request.

## Code Style

- TypeScript strict mode; tests are typechecked too.
- Biome + Ultracite. `pnpm format` before committing.
- Prefer pure functions in the query compiler — every compile method should be unit-tested with string/param assertions.
- No `any` in public APIs; internal `any` is tolerated but minimize it.
- All environment access goes through `env` from `@t3-oss/env-core` — never `process.env` directly.

## Project Layout

- `cli/` — `@graph-om/cli` — `graph-om init` / `graph-om generate`
- `packages/sdk/` — `@graph-om/sdk` — schema DSL, Cypher compiler, client, config
- `packages/sdk/src/driver/` — `@graph-om/sdk/driver/*` — DriverAdapter implementations (Neo4j, Memgraph, Kuzu, FalkorDB)
- `packages/zod/` — `@graph-om/zod` — Zod validation integration
- `examples/social-graph/` — end-to-end example app
- `docs/` — documentation (uppercase snake_case file names)

## Reporting Bugs

Open an issue with a minimal reproduction. For security issues, see `SECURITY.md`.

## License

Apache-2.0
