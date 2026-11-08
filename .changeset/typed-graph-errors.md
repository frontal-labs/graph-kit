---
"@graph-om/sdk": minor
"@graph-om/migrate": patch
"@graph-om/mcp": patch
"@graph-om/cli": patch
---

Replace plain `Error`s with typed `GraphError`s from `@frontal-labs/error`.

- Every graph-om failure has a stable `code` (for example `record_not_found`, `connection_failed`, `constraint_violation`), a `statusCode`, and `retry`. Branch with `hasCode(error, 'record_not_found')` from the new `@graph-om/sdk/errors` subpath.
- Driver errors from Neo4j, Memgraph, Kuzu and FalkorDB are classified and keep the original error on `cause`. The driver's own code is on `metadata.driverCode`.
- `GraphError` still extends `Error`. Messages are unchanged except for the three noted below, so existing `.message` checks keep working.
- **Behaviour change:** `upsert()` now throws `upsert_failed` when the database returns no record. It previously returned `undefined`.
- **Behaviour change:** the Neo4j connection error now reads `Failed to connect to Neo4j`. The URI moved to `metadata.uri`, and the original error is on `cause`.
- **Message change:** `GraphTransaction` now uses the same "not registered" message as `GraphClient`.
- MCP tool errors and generated GraphQL resolver errors carry only the code and a fixed public message. The CLI prints formatted errors to stderr and exits with code 1.
- `@graph-om/sdk` now depends on `@frontal-labs/error@0.7.0` (pinned) and bundles it. See `THIRD_PARTY_NOTICES.md`.
