// @graph-om/sdk/src/errors/index.ts
// Typed graph-om errors. Built on @frontal-labs/error (bundled into the SDK).
//
// Codes are stable identifiers callers can branch on with `hasCode`.
// Messages are developer-facing; surfaces that face clients (MCP, GraphQL)
// map them to public text with `toPublic` before sending.

import {
  type CreateErrorOptions,
  createErrors,
  FrontalError,
  getRootCause,
  hasCode as hasFrontalCode,
  isFrontalError,
} from '@frontal-labs/error';

export { formatError } from '@frontal-labs/error/format';
export { errorResponse } from '@frontal-labs/error/server';

export type GraphErrorCode =
  | 'node_not_registered'
  | 'create_failed'
  | 'record_not_found'
  | 'upsert_failed'
  | 'driver_not_connected'
  | 'connection_failed'
  | 'constraint_violation'
  | 'query_syntax_error'
  | 'transient_failure'
  | 'query_failed'
  | 'invalid_config'
  | 'invalid_argument'
  | 'unsupported_option'
  | 'not_found'
  | 'user_exists'
  | 'invalid_credentials'
  | 'authentication_required'
  | 'forbidden'
  | 'migration_failed';

export interface RetryPolicy {
  readonly retryable: boolean;
}

export interface GraphErrorOptions extends CreateErrorOptions<GraphErrorCode> {
  readonly retry?: RetryPolicy;
}

const DOCS_URL = 'https://github.com/frontal-labs/graph-om/blob/main/docs/errors.md';

/**
 * A graph-om error. `retry` is graph-om's own field, set by the thrower;
 * `@frontal-labs/error@0.7.0` has no retry option of its own.
 */
export class GraphError extends FrontalError<GraphErrorCode> {
  readonly retry: RetryPolicy;

  constructor(message: string, options: GraphErrorOptions = {}) {
    const { retry, ...rest } = options;
    super(message, rest);
    this.retry = retry ?? { retryable: false };
  }
}

const factory = createErrors<GraphErrorCode, GraphError>({
  scope: 'graph-om',
  docsBaseUrl: (code) => `${DOCS_URL}#${code}`,
  ErrorClass: GraphError,
});

/** Create and throw a graph-om error. Declared `never` so callers keep type narrowing. */
export function raiseGraphError(message: string, options: GraphErrorOptions): never {
  throw factory.create(message, options);
}

export const graphErrors = {
  create: (message: string, options: GraphErrorOptions): GraphError =>
    factory.create(message, options),
  raise: raiseGraphError,
};

export { FrontalError, getRootCause, isFrontalError };

/**
 * True when `error` is a graph-om error with one of `codes`. Narrows to `GraphError`,
 * so `statusCode`, `retry` and `metadata` stay typed after the check.
 */
export function hasCode(
  error: unknown,
  codes: GraphErrorCode | readonly GraphErrorCode[],
): error is GraphError {
  return hasFrontalCode(error, codes as GraphErrorCode);
}

const CONSTRAINT_VIOLATION = 'Neo.ClientError.Schema.ConstraintValidationFailed';
const SYNTAX_ERROR = 'Neo.ClientError.Statement.SyntaxError';
const TRANSIENT_PREFIX = 'Neo.TransientError.';

/**
 * Adapter boundary helper: errors that are already graph-om errors pass through
 * unchanged, and everything else is classified as a driver failure.
 */
export function classifyDriverError(error: unknown, driver: string): unknown {
  return isFrontalError(error) ? error : mapDriverError(error, { driver });
}

/**
 * Convert a native driver error into a typed graph-om error.
 * The original error is kept as `cause`, and the driver's own code goes in
 * `metadata.driverCode`. Driver messages are kept as-is; Cypher text and
 * parameters are never copied into the error.
 */
export function mapDriverError(error: unknown, context: { driver: string }): GraphError {
  const driverCode = (error as { code?: unknown } | null)?.code;
  const nativeCode = typeof driverCode === 'string' ? driverCode : undefined;
  const message = error instanceof Error ? error.message : String(error);

  let code: GraphErrorCode = 'query_failed';
  let statusCode = 500;
  let retry: RetryPolicy = { retryable: false };

  if (nativeCode === CONSTRAINT_VIOLATION) {
    code = 'constraint_violation';
    statusCode = 409;
  } else if (nativeCode === SYNTAX_ERROR) {
    code = 'query_syntax_error';
    statusCode = 400;
  } else if (nativeCode?.startsWith(TRANSIENT_PREFIX)) {
    code = 'transient_failure';
    statusCode = 503;
    retry = { retryable: true };
  }

  return graphErrors.create(message, {
    code,
    statusCode,
    retry,
    cause: error,
    metadata: nativeCode ? { driverCode: nativeCode } : undefined,
    attributes: { 'db.system': context.driver },
  });
}

/**
 * True when a graph-om error says it is safe to retry. Tag-based, so it works across
 * package entry points, where `instanceof GraphError` can be false.
 */
export function isRetryable(error: unknown): boolean {
  return isFrontalError(error) && (error as Partial<GraphError>).retry?.retryable === true;
}

/**
 * Tracks which side of a transaction failed. Errors from the caller's own code pass
 * through unchanged; errors from the driver are classified for `driver`.
 */
export function driverErrorBoundary(driver: string) {
  let userFailed = false;
  return {
    user: <R>(work: () => Promise<R>): Promise<R> =>
      work().catch((error: unknown) => {
        userFailed = true;
        throw error;
      }),
    classify: (error: unknown): unknown =>
      userFailed ? error : classifyDriverError(error, driver),
  };
}

/** The stable graph-om code of an error, or undefined for anything else. Safe for metric labels. */
export function errorCode(error: unknown): GraphErrorCode | undefined {
  return isFrontalError(error) ? (error.code as GraphErrorCode | undefined) : undefined;
}

/** Client-facing text per code. Never includes Cypher, labels, values or URIs. */
const PUBLIC_MESSAGES: Partial<Record<GraphErrorCode, string>> = {
  record_not_found: 'The requested record does not exist',
  not_found: 'The requested item does not exist',
  node_not_registered: 'The requested type is not part of the schema',
  connection_failed: 'The graph database is unavailable',
  driver_not_connected: 'The graph database is unavailable',
  transient_failure: 'The graph database is temporarily unavailable',
  invalid_argument: 'The request is invalid',
  query_syntax_error: 'The request is invalid',
  constraint_violation: 'The request conflicts with existing data',
  user_exists: 'An account with these details already exists',
  invalid_credentials: 'Invalid credentials',
  authentication_required: 'Authentication is required',
  forbidden: 'You do not have permission to perform this action',
};

const FALLBACK_PUBLIC_MESSAGE = 'The graph operation failed';

/**
 * Wrap any error for client output. Keeps `scope`, `code` and an HTTP status
 * (500 when unknown); the original error stays on `cause` for server logs.
 */
export function toPublic(error: unknown): FrontalError<GraphErrorCode> {
  const code = errorCode(error);
  const status = isFrontalError(error) ? error.statusCode : undefined;
  const statusCode = status !== undefined && status >= 400 && status <= 599 ? status : 500;
  const message = (code && PUBLIC_MESSAGES[code]) || FALLBACK_PUBLIC_MESSAGE;
  return new FrontalError<GraphErrorCode>(message, {
    scope: 'graph-om',
    code,
    statusCode,
    cause: error,
    public: { message },
  });
}
