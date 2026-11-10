import { describe, expect, it, vi } from 'vitest';
import { errorResponse, GraphError, toPublic } from '../src/errors';
import { generateResolvers } from '../src/graphql';

// A realistic internal failure: it carries a URI with credentials, Cypher text,
// a label and a value in its developer fields. None of that may reach a client.
function internalFailure() {
  return new GraphError('Failed to update Person: record not found', {
    code: 'record_not_found',
    statusCode: 404,
    retry: { retryable: false },
    reason: 'MATCH (p:Person {email: "ada@example.com"}) SET p.name = $name',
    hint: 'bolt://admin:hunter2@db.internal:7687',
    fix: 'Check the Person where clause for ada@example.com',
    metadata: { label: 'Person', uri: 'bolt://admin:hunter2@db.internal:7687' },
    attributes: { 'db.system': 'neo4j' },
  });
}

const LEAK_PATTERNS = [/bolt:/, /hunter2/, /MATCH/, /Person/, /ada@example/, /db\.internal/];

describe('client-facing error payloads', () => {
  it('sends only scope, code and the public message', () => {
    const { status, body } = errorResponse(toPublic(internalFailure()));
    const data = JSON.parse(body) as { error: Record<string, unknown> };

    expect(status).toBe(404);
    expect(Object.keys(data.error).sort()).toEqual(['code', 'message', 'scope']);
    expect(data.error).toEqual({
      scope: 'graph-kit',
      code: 'record_not_found',
      message: 'The requested record does not exist',
    });
  });

  it('never includes Cypher, labels, values or URIs in the serialized payload', () => {
    const { body } = errorResponse(toPublic(internalFailure()));
    for (const text of [body]) {
      for (const pattern of LEAK_PATTERNS) {
        expect(text).not.toMatch(pattern);
      }
    }
  });

  it('keeps the original error on cause for server-side logs', () => {
    const original = internalFailure();
    expect(toPublic(original).cause).toBe(original);
  });

  it('falls back to a generic status and message for non-graph errors', () => {
    const { status, body } = errorResponse(toPublic(new Error('socket hang up at 10.0.0.4')));
    const data = JSON.parse(body) as { error: Record<string, unknown> };

    expect(status).toBe(500);
    expect(data.error.message).toBe('The graph operation failed');
    expect(data.error.code).toBeUndefined();
    expect(body).not.toMatch(/10\.0\.0\.4/);
  });
});

describe('GraphQL resolver errors', () => {
  it('rejects with the public message and a client-safe extensions object', async () => {
    const client = {
      findMany: vi.fn(async () => {
        throw internalFailure();
      }),
    };
    const resolvers = generateResolvers({
      schema: { Person: { relations: {} } } as never,
      client: client as never,
    }) as { Query: { persons: (...args: unknown[]) => Promise<unknown> } };

    const error = (await resolvers.Query.persons(undefined, {}).catch(
      (e: unknown) => e,
    )) as Error & {
      extensions: unknown;
    };

    expect(error.message).toBe('The requested record does not exist');
    expect(error.extensions).toEqual({
      scope: 'graph-kit',
      code: 'record_not_found',
      message: 'The requested record does not exist',
    });
    expect(JSON.stringify(error.extensions)).not.toMatch(/bolt:|hunter2|MATCH|Person/);
  });

  it('returns successful results unchanged', async () => {
    const client = { findMany: vi.fn(async () => [{ id: '1' }]) };
    const resolvers = generateResolvers({
      schema: { Person: { relations: {} } } as never,
      client: client as never,
    }) as { Query: { persons: (...args: unknown[]) => Promise<unknown> } };

    await expect(resolvers.Query.persons(undefined, {})).resolves.toEqual([{ id: '1' }]);
  });
});
