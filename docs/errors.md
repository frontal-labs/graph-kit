# Errors

Every failure graph-kit throws is a `GraphError`. It extends `Error`, so `instanceof Error` and `.message` keep working, and it adds three things you can rely on:

- **`code`**: a stable identifier, such as `record_not_found`. Branch on it, not on the message.
- **`statusCode`**: an HTTP-style status (400–599) for surfaces that map errors to responses.
- **`retry`**: `{ retryable: boolean }`. Only retry when `retryable` is `true`, and only if the operation is safe to repeat.

```ts
import { hasCode } from '@graph-kit/sdk/errors';

try {
  await client.update('Person', { where: { id }, data });
} catch (error) {
  if (hasCode(error, 'record_not_found')) {
    // handle a missing record
  }
  throw error;
}
```

Driver failures keep the original error on `cause`, and the native driver code is on `metadata.driverCode`.

Check errors with `hasCode`, `isFrontalError` or `isRetryable`, not `instanceof`. Each SDK entry point bundles its own copy of the error classes, so `instanceof GraphError` can be `false` for an error thrown by another entry point.

Anchors below match the `link` that each error carries.

## node_not_registered

- **Status:** 400 · **Retryable:** no
- **Meaning:** the label you passed is not part of the schema the client was created with.
- **Typical cause:** a typo in a label, or a node type that was never passed to `registerNode()` or the `GraphClient` constructor.
- **Fix:** register the node, or correct the label.

## create_failed

- **Status:** 500 · **Retryable:** no
- **Meaning:** a `create` ran but the database returned no record.
- **Typical cause:** a constraint or a condition in the create query rejected the write without raising a driver error.
- **Fix:** check the data and any constraints on the label.

## record_not_found

- **Status:** 404 · **Retryable:** no
- **Meaning:** an `update` matched no record.
- **Typical cause:** the `where` clause matches nothing, or the record was deleted first.
- **Fix:** check the `where` clause, or use `upsert` if the record may not exist.

## upsert_failed

- **Status:** 500 · **Retryable:** no
- **Meaning:** an `upsert` returned no record. Earlier releases returned `undefined` silently in this case.
- **Typical cause:** the same as `create_failed`.
- **Fix:** check the data and the primary-key condition.

## driver_not_connected

- **Status:** 500 · **Retryable:** no
- **Meaning:** a query was made before the driver connected.
- **Typical cause:** `connect()` was not awaited, or `disconnect()` ran first.
- **Fix:** call `connect()` or `GraphClient.connect()` before running queries.

## connection_failed

- **Status:** 503 · **Retryable:** yes
- **Meaning:** the client could not reach the database.
- **Typical cause:** a wrong URI or credentials, the server is down, or a network or TLS problem.
- **Fix:** check the connection settings and that the database is reachable. Retrying can succeed once the database is back.
- **Details:** `metadata.uri` holds the address, and `cause` holds the driver error. Credentials are never included.

## constraint_violation

- **Status:** 409 · **Retryable:** no
- **Meaning:** the write broke a database constraint, such as a uniqueness constraint.
- **Typical cause:** a duplicate value for a unique property.
- **Fix:** check for an existing record first, or use `upsert`.

## query_syntax_error

- **Status:** 400 · **Retryable:** no
- **Meaning:** the database rejected the Cypher as malformed.
- **Typical cause:** a bug in a raw query passed to `runQuery`, or an unsupported syntax for the database version.
- **Fix:** correct the query. The driver message in `message` describes the problem.

## transient_failure

- **Status:** 503 · **Retryable:** yes
- **Meaning:** the database hit a temporary problem, such as a deadlock or a leader change.
- **Typical cause:** concurrent writes to the same records, or a cluster that is changing role.
- **Fix:** retry with backoff. The operation must be safe to repeat.

## query_failed

- **Status:** 500 · **Retryable:** no
- **Meaning:** the database failed a query for a reason graph-kit does not classify further.
- **Typical cause:** a driver error with no specific code, or an unexpected response.
- **Fix:** read `cause` and `metadata.driverCode` for the native error.

## invalid_config

- **Status:** 400 · **Retryable:** no
- **Meaning:** the configuration is invalid or incomplete.
- **Typical cause:** an unknown driver type, a missing optional driver package (`kuzu`, `ioredis`, `@redis/client`), or a schema file that does not exist.
- **Fix:** correct the config, or install the missing package.

## invalid_argument

- **Status:** 400 · **Retryable:** no
- **Meaning:** an argument has a value graph-kit cannot use.
- **Typical cause:** an identifier that is not a valid label or property name, a non-date value for a `DateTime`, or an empty array passed where one item is needed.
- **Fix:** correct the argument.

## unsupported_option

- **Status:** 400 · **Retryable:** no
- **Meaning:** the requested feature or format is not available in this release.
- **Typical cause:** an unsupported output format, nested transactions on Kuzu, or a function that is not yet implemented.
- **Fix:** use a supported option, or see the release notes for the feature's status.

## not_found

- **Status:** 404 · **Retryable:** no
- **Meaning:** the named item does not exist. This covers an unknown MCP tool or resource, and a user that cannot be found during token refresh.
- **Fix:** check the name or identifier.

## user_exists

- **Status:** 409 · **Retryable:** no
- **Meaning:** registration was attempted for an email that already has an account.
- **Fix:** sign in instead, or use another email.

## invalid_credentials

- **Status:** 401 · **Retryable:** no
- **Meaning:** the email and password pair is wrong, or a refresh token is invalid.
- **Fix:** ask the user to sign in again.

## authentication_required

- **Status:** 401 · **Retryable:** no
- **Meaning:** a protected operation was called without a valid session.
- **Fix:** authenticate and pass the access token.

## forbidden

- **Status:** 403 · **Retryable:** no
- **Meaning:** the user is authenticated but lacks the required role or permission.
- **Fix:** grant the role or permission, or do not call the operation.

## migration_failed

- **Status:** 500 · **Retryable:** no
- **Meaning:** a migration could not be loaded, rolled back, or matched to its definition.
- **Typical cause:** a migration file that does not export the expected version, or a missing `down` step.
- **Fix:** check the migration file and its exports, and add the missing `down` step if you need to roll back.

## Surfaces that face clients

Errors from the SDK carry developer detail (`message`, `cause`, `metadata`). Before sending an error to a client, convert it with `toPublic` from `@graph-kit/sdk/errors`. The MCP server and the generated GraphQL resolvers already do this. The client receives only `scope`, `code` and a fixed public message, and never Cypher text, labels, values or URIs.
