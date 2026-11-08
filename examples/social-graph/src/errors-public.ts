// errors-public.ts - What clients receive, and what stays on the server
// Run: pnpm start:errors-public
// No database needed: this builds errors by hand, the way the SDK does internally.

import { graphErrors } from '@graph-om/sdk';
import { errorResponse, formatError, toPublic } from '@graph-om/sdk/errors';
import { toGraphQLError } from '@graph-om/sdk/graphql';

// An internal failure, with details that must never reach a client
const internal = graphErrors.create('Failed to update User: record not found', {
  code: 'record_not_found',
  statusCode: 404,
  retry: { retryable: false },
  reason: 'MATCH (u:User {email: "ada@example.com"}) SET u.name = $name',
  metadata: { label: 'User', uri: 'bolt://admin:hunter2@db.internal:7687' },
});

// 1. A REST-style response: status, body and headers, with only the public fields
const { status, body } = errorResponse(toPublic(internal));
console.log('1. HTTP status:', status);
console.log('   body:', body);

// 2. The same error for a GraphQL server: the public message, and client-safe extensions
const graphQLError = toGraphQLError(internal);
console.log('2. GraphQL message:', graphQLError.message);
console.log(
  '   extensions:',
  JSON.stringify((graphQLError as Error & { extensions: unknown }).extensions),
);

// 3. Errors that are not graph-om errors get a generic response, with no internal text
const unexpected = new Error('socket hang up at 10.0.0.4:7687');
const generic = errorResponse(toPublic(unexpected));
console.log('3. unexpected error -> HTTP', generic.status, generic.body);

// 4. The server keeps the full detail for logs
console.log('4. server log (never sent to clients):');
console.log(formatError(internal, { format: 'plain' }));
