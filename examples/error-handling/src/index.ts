// index.ts - hasCode, isRetryable, toPublic
// Run: pnpm start
// Does NOT require a database.

import { GraphError, getRootCause, hasCode, isFrontalError, isRetryable } from '@graph-kit/sdk';

// ---------------------------------------------------------------------------
// Construct and inspect typed Graph-Kit errors
// ---------------------------------------------------------------------------

function inspect(label: string, error: unknown) {
  console.log(`\n--- ${label} ---`);
  console.log('  isGraphError:', error instanceof GraphError);
  console.log('  isFrontalError:', isFrontalError(error));
  console.log('  hasCode("record_not_found"):', hasCode(error, 'record_not_found'));
  console.log('  hasCode("invalid_argument"):', hasCode(error, 'invalid_argument'));
  console.log('  isRetryable:', isRetryable(error));
  const cause = getRootCause(error) as Error | undefined;
  console.log('  root cause:', cause?.message ?? '(none)');
}

async function main() {
  // A not-found error (typically not retryable)
  const notFound = new GraphError('User with id "missing" was not found', {
    code: 'record_not_found',
    statusCode: 404,
  });
  inspect('GraphError record_not_found', notFound);

  // A validation error (not retryable)
  const validation = new GraphError('Email is required', {
    code: 'invalid_argument',
    statusCode: 400,
  });
  inspect('GraphError invalid_argument', validation);

  // A transient/database error (retryable)
  const transient = new GraphError('connection timed out', {
    code: 'transient_failure',
    statusCode: 503,
    retry: { retryable: true },
  });
  inspect('GraphError transient_failure (retryable)', transient);

  // Wrapping an underlying error preserves the root cause
  const wrapped = new GraphError('Failed to create user', {
    code: 'query_failed',
    statusCode: 500,
    cause: new Error('neo4j: socket hang up'),
  });
  inspect('GraphError wrapped with cause', wrapped);

  // toPublic - strip internals for client-facing responses
  console.log('\n--- toPublic (client-safe shape) ---');
  const publicShape = {
    code: notFound.code ?? 'unknown',
    message: notFound.message,
    statusCode: notFound.statusCode,
    retryable: isRetryable(notFound),
  };
  console.log(JSON.stringify(publicShape, null, 2));

  // Plain (non-Graph-Kit) errors still inspect safely
  inspect('plain Error', new Error('something went wrong'));

  console.log('\nError handling example complete (no database required).');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
