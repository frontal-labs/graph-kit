# @graph-om/migrate

Graph-OM migration system — schema versioning and database migrations for graph databases. Provides a `MigrationRunner` that applies and rolls back Cypher migrations, tracks applied migrations as `Migration` nodes in the graph, and can generate migrations from schema diffs.

## Installation

```bash
pnpm add @graph-om/migrate @graph-om/sdk
```

## Quick start

```ts
import { MigrationRunner, generateVersion } from '@graph-om/migrate';
import { QueryCompiler } from '@graph-om/sdk';
import { createNeo4jDriver } from '@graph-om/neo4j';

const driver = createNeo4jDriver({ uri, username, password });
await driver.connect();

const runner = new MigrationRunner({
  driver,
  migrationsDir: './migrations',
  tableName: '_graph_om_migrations',
});

await runner.initialize();

const migrations = [
  {
    version: generateVersion(),
    name: 'create_user_node',
    timestamp: Date.now(),
    up: (compiler) => [
      // e.g. compiler.compileCreateConstraint('User', ['id'], { type: 'UNIQUE' }).cypher
      'CREATE CONSTRAINT user_id_unique IF NOT EXISTS FOR (u:User) REQUIRE u.id IS UNIQUE',
    ],
    down: (compiler) => [
      'DROP CONSTRAINT user_id_unique IF NOT EXISTS',
    ],
  },
];

const applied = await runner.migrate(migrations);
console.log('Applied:', applied.map((m) => m.version));

const status = await runner.status(migrations);
// rollback last 1
// await runner.rollback(migrations, 1);

await driver.disconnect();
```

## API

### `MigrationRunner`

Class that executes migrations against a graph database.

```ts
export class MigrationRunner {
  constructor(options: MigrationOptions);
  async initialize(): Promise<void>;
  async migrate(migrations: Migration[]): Promise<Migration[]>;
  async rollback(migrations: Migration[], steps: number): Promise<Migration[]>;
  async status(migrations: Migration[]): Promise<MigrationStatus[]>;
}
```

| Method | Description |
|--------|-------------|
| `new MigrationRunner(options)` | Create a runner with a driver, optional schema registry, migrations directory, and migrations table/node name |
| `initialize()` | Connect the driver and ensure the migrations tracking node exists (`MERGE (m:Migration {table: $tableName})`) |
| `migrate(migrations)` | Apply pending migrations in version order; record each as a `Migration` node |
| `rollback(migrations, steps)` | Revert the last `steps` applied migrations (newest first) |
| `status(migrations)` | Return the applied status of each migration |

### `MigrationOptions`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `driver` | `DriverAdapter` | yes | Graph-OM driver adapter |
| `schema` | `GraphSchemaRegistry` | no | Optional schema registry for diffing |
| `migrationsDir` | string | `'./migrations'` | Directory containing migration files |
| `tableName` | string | `'_graph_om_migrations'` | Migrations tracking node/table name |

### `Migration`

| Field | Type | Description |
|-------|------|-------------|
| `version` | string | Migration version (typically a timestamp) |
| `name` | string | Human-readable migration name |
| `timestamp` | number | Creation timestamp |
| `up` | `(compiler: QueryCompiler) => string[]` | Cypher statements to apply |
| `down` | `(compiler: QueryCompiler) => string[]` | Cypher statements to revert |

### Helpers

| Function | Description |
|----------|-------------|
| `generateVersion()` | Return `Date.now().toString()` as a version |
| `createMigrationTemplate(options)` | Generate a migration file template with `up`/`down` stubs |
| `diffSchemas(oldSchema, newSchema)` | Compute a `SchemaDiff` between two schema registries |
| `generateMigrationFromDiff(diff, name)` | Build a `Migration` from a `SchemaDiff` |
| `loadMigrations(migrationsDir)` | Load migration files from disk (stub; returns `[]`) |

### `MigrationStatus`

| Field | Type | Description |
|-------|------|-------------|
| `version` | string | Migration version |
| `name` | string | Migration name |
| `applied` | boolean | Whether it has been applied |
| `appliedAt` | Date | When it was applied |
| `checksum` | string | Checksum of the migration content |

### `SchemaDiff`

| Field | Type | Description |
|-------|------|-------------|
| `addedNodes` | string[] | Node labels added |
| `removedNodes` | string[] | Node labels removed |
| `modifiedNodes` | Map<string, NodeDiff> | Nodes with property/index/constraint changes |
| `addedRelations` | string[] | Relationship types added |
| `removedRelations` | string[] | Relationship types removed |

### `NodeDiff` / `PropertyDiff`

`NodeDiff` tracks `addedProperties`, `removedProperties`, `modifiedProperties` (Map of `PropertyDiff`), `addedIndexes`, `removedIndexes`, `addedConstraints`, `removedConstraints`. `PropertyDiff` flags changes to `type`, `nullable`, `array`, `primary`, `unique`, and `default` with old/new values.

## Migration tracking

Applied migrations are stored as `Migration` nodes in the graph with `version`, `name`, `appliedAt`, and `checksum` properties. Re-initialization is idempotent via `MERGE`.

## License

Apache 2.0
