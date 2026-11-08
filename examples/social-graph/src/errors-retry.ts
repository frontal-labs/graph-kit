// errors-retry.ts - Retry only the errors marked retryable, and only with backoff
// Run: pnpm start:errors-retry
// Uses a port nothing listens on, so it runs without a database.

import { hasCode, isRetryable } from '@graph-om/sdk';
import { createNeo4jDriver } from '@graph-om/sdk/driver/neo4j';

const MAX_ATTEMPTS = 3;

// Retries only when the error says it is safe to. `isRetryable` is tag-based, so it works
// even when the error was created by a different copy of the SDK.
async function withRetry<T>(label: string, operation: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (!isRetryable(error) || attempt >= MAX_ATTEMPTS) throw error;

      const delayMs = 200 * 2 ** (attempt - 1);
      console.log(`${label}: attempt ${attempt} failed, retrying in ${delayMs}ms`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

async function main() {
  const driver = createNeo4jDriver({
    type: 'neo4j',
    uri: 'bolt://localhost:1', // nothing listens here
    username: 'neo4j',
    password: 'password',
  });

  try {
    await withRetry('connect', () => driver.connect());
    console.log('connected');
  } catch (error) {
    if (hasCode(error, 'connection_failed')) {
      const { uri } = error.metadata as { uri: string };
      console.log(`gave up after ${MAX_ATTEMPTS} attempts: cannot reach ${uri}`);
      console.log(
        'HTTP-style status:',
        error.statusCode,
        '| cause:',
        (error.cause as Error)?.message,
      );
    } else {
      throw error;
    }
  }
}

main().catch((error: unknown) => {
  console.error('unexpected failure:', error);
  process.exitCode = 1;
});
