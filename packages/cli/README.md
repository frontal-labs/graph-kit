# @graph-kit/cli

CLI for Graph-Kit.

```bash
npx graph-kit init [directory]   # scaffold a new project
npx graph-kit generate           # generate types/client (and zod) from schema
npx graph-kit generate --watch   # regenerate on schema changes
```

Reads `graph-kit.config.ts` (or `graph-kit.config.json`) for the schema path, output directory, zod flag, and excluded labels.

Generated files land in `src/__generated__` by default:

- `types.ts` — node interfaces, `Where`, `CreateInput`, `UpdateInput` types
- `client.ts` — `createClient()` factory wiring `@graph-kit/sdk/driver/neo4j` to `GraphClient`
- `zod.ts` — Zod schemas (when `output.zod: true`)

## License

Apache-2.0
