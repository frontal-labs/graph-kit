# @graph-om/cli

CLI for Graph-OM.

```bash
npx graph-om init [directory]   # scaffold a new project
npx graph-om generate           # generate types/client (and zod) from schema
npx graph-om generate --watch   # regenerate on schema changes
```

Reads `graph-om.config.ts` (or `graph-om.config.json`) for the schema path, output directory, zod flag, and excluded labels.

Generated files land in `src/__generated__` by default:

- `types.ts` — node interfaces, `Where`, `CreateInput`, `UpdateInput` types
- `client.ts` — `createClient()` factory wiring `@graph-om/neo4j` to `GraphClient`
- `zod.ts` — Zod schemas (when `output.zod: true`)

## License

MIT
