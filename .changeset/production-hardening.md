---
'@graph-om/sdk': patch
'@graph-om/cli': patch
'@graph-om/neo4j': patch
'@graph-om/zod': patch
---

Production hardening across all packages.

@graph-om/sdk:

- Fix invalid Cypher in `compileUpsert`: MERGE now targets the primary key pattern with a parameterized value; `ON CREATE SET`/`ON MATCH SET` param names are no longer corrupted. Upsert without primary-key equality throws a descriptive error.
- Replace deprecated `id()` with `elementId()` in relation create/delete; `compileDeleteRelation` now actually filters both endpoints (previously deleted arbitrary relationships).
- Fix invalid `<-[r]->` Cypher in `compileInclude` for `IN`-direction relations.
- Batch relation hydration (`include:`) with `UNWIND $ids` — one query per relation instead of N+1.
- `GraphTransaction` results now normalize Neo4j integers/temporals like the client path.
- Remove hardcoded demo `UserNode`/`PostNode`/`CommentNode` from `InferNode`; introduce `GraphSchemaRegistry` and registry-aware `InferNode<'User', typeof graph>`.
- Deduplicate `GraphConfig` types; export `./config` subpath, `CompiledQuery`, `parseNeo4jValue`, `NoInferShim`, and full inference types from the barrel.
- Fix type-inference bugs on `findUnique`/`update`/`upsert`/`delete` where clauses (NoInfer shim); fix `CreateOptions.relations.connect` union shape.
- Remove unused `zod` dependency and `neo4j-driver` peer dependency.

@graph-om/cli:

- Add test suite (23 tests) and vitest config — `pnpm test` now passes at the repo root.
- Generate `.d.ts` (was declared but never built); version read from package.json at build time.
- Fix scaffold template calling nonexistent `GraphClient.connect()` — now wires `createNeo4jDriver` + `new GraphClient(driver, graph)`.
- Per-relation `multiple: true` detection (was node-wide); honor `exclude` and `output.zod` config flags (zod schemas are now generated); implement `--watch`.
- Generated `client.ts` now registers node configs and has valid `GraphNodeMap` types.
- Drop unused `chalk`/`execa` dependencies; add `files`, `sideEffects`, MIT license metadata.

@graph-om/neo4j:

- Generate `.d.ts` (was declared but never built); type-safe result mapping against official driver types; package hygiene (`files`, `sideEffects`, license).

@graph-om/zod:

- Fix `array` + `nullable` ordering: now `T[] | null` instead of `(T|null)[]`.
- Declare `@graph-om/sdk` as a peer dependency; package hygiene.

Repo:

- ESLint flat config (was completely unconfigured — `pnpm lint` failed everywhere); tests are now typechecked; CI workflows (build/lint/typecheck/test + changesets release); MIT LICENSE, READMEs, CONTRIBUTING, SECURITY, changesets config, docker-compose for integration testing, `.editorconfig`, `.prettierignore`, `.nvmrc`; publish hygiene (`files`, `sideEffects`, `license` in all packages); pnpm 9 / Node 20 alignment.
