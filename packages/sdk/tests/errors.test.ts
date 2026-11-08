import { describe, expect, it } from 'vitest';
import {
  classifyDriverError,
  FrontalError,
  GraphError,
  type GraphErrorCode,
  getRootCause,
  graphErrors,
  hasCode,
  isFrontalError,
  mapDriverError,
  raiseGraphError,
} from '../src/errors';

function driverError(code: string | undefined, message = 'driver said no'): Error {
  const error = new Error(message) as Error & { code?: string };
  if (code !== undefined) error.code = code;
  return error;
}

describe('graph-om errors', () => {
  it('creates scoped, tagged errors that still extend Error', () => {
    const error = graphErrors.create('boom', { code: 'query_failed', statusCode: 500 });

    expect(error).toBeInstanceOf(GraphError);
    expect(error).toBeInstanceOf(FrontalError);
    expect(error).toBeInstanceOf(Error);
    expect(isFrontalError(error)).toBe(true);
    expect(error.scope).toBe('graph-om');
    expect(error.message).toBe('boom');
  });

  it('defaults retry to non-retryable', () => {
    expect(graphErrors.create('x', { code: 'query_failed' }).retry).toEqual({ retryable: false });
  });

  it('keeps retry as graph-om metadata, not as a frontal option', () => {
    const error = graphErrors.create('x', {
      code: 'connection_failed',
      retry: { retryable: true },
    });
    expect(error.retry).toEqual({ retryable: true });
  });

  it('links each code to its anchor in the errors doc', () => {
    const error = graphErrors.create('x', { code: 'record_not_found' });
    expect(error.link).toBe(
      'https://github.com/frontal-labs/graph-om/blob/main/docs/errors.md#record_not_found',
    );
  });

  it('raiseGraphError throws the same kind of error', () => {
    expect(() => raiseGraphError('nope', { code: 'node_not_registered', statusCode: 400 })).toThrow(
      GraphError,
    );
  });

  it('hasCode narrows by a single code or a list of codes', () => {
    const error: unknown = graphErrors.create('x', { code: 'record_not_found' });
    expect(hasCode(error, 'record_not_found')).toBe(true);
    expect(hasCode(error, 'create_failed')).toBe(false);
    expect(hasCode(error, ['create_failed', 'record_not_found'])).toBe(true);
    expect(hasCode(new Error('plain'), 'record_not_found')).toBe(false);
  });

  it('preserves cause through getRootCause', () => {
    const original = new Error('root');
    const wrapped = graphErrors.create('wrapped', { code: 'query_failed', cause: original });
    expect(wrapped.cause).toBe(original);
    expect(getRootCause(wrapped)).toBe(original);
  });

  describe('catalogue', () => {
    const cases: Array<[GraphErrorCode, number, boolean]> = [
      ['node_not_registered', 400, false],
      ['create_failed', 500, false],
      ['record_not_found', 404, false],
      ['upsert_failed', 500, false],
      ['driver_not_connected', 500, false],
      ['connection_failed', 503, true],
      ['constraint_violation', 409, false],
      ['query_syntax_error', 400, false],
      ['transient_failure', 503, true],
      ['query_failed', 500, false],
      ['invalid_config', 400, false],
      ['invalid_argument', 400, false],
      ['unsupported_option', 400, false],
      ['not_found', 404, false],
      ['user_exists', 409, false],
      ['invalid_credentials', 401, false],
      ['authentication_required', 401, false],
      ['forbidden', 403, false],
      ['migration_failed', 500, false],
    ];

    it.each(cases)('%s uses status %i and retryable=%s', (code, status, retryable) => {
      const error = graphErrors.create('x', {
        code,
        statusCode: status,
        retry: { retryable },
      });
      expect(error.code).toBe(code);
      expect(error.statusCode).toBe(status);
      expect(error.retry.retryable).toBe(retryable);
    });
  });
});

describe('mapDriverError', () => {
  it('maps constraint violations to constraint_violation (409)', () => {
    const error = mapDriverError(driverError('Neo.ClientError.Schema.ConstraintValidationFailed'), {
      driver: 'neo4j',
    });
    expect(error.code).toBe('constraint_violation');
    expect(error.statusCode).toBe(409);
    expect(error.retry.retryable).toBe(false);
  });

  it('maps syntax errors to query_syntax_error (400)', () => {
    const error = mapDriverError(driverError('Neo.ClientError.Statement.SyntaxError'), {
      driver: 'neo4j',
    });
    expect(error.code).toBe('query_syntax_error');
    expect(error.statusCode).toBe(400);
  });

  it('maps any Neo.TransientError.* to a retryable transient_failure (503)', () => {
    const error = mapDriverError(driverError('Neo.TransientError.Transaction.DeadlockDetected'), {
      driver: 'neo4j',
    });
    expect(error.code).toBe('transient_failure');
    expect(error.statusCode).toBe(503);
    expect(error.retry).toEqual({ retryable: true });
  });

  it('maps unknown or missing driver codes to query_failed (500)', () => {
    expect(mapDriverError(driverError('Something.Else'), { driver: 'neo4j' }).code).toBe(
      'query_failed',
    );
    expect(mapDriverError(new Error('no code'), { driver: 'kuzu' }).code).toBe('query_failed');
  });

  it('keeps the original error as cause and the driver code in metadata', () => {
    const original = driverError('Neo.ClientError.Statement.SyntaxError', 'bad cypher');
    const error = mapDriverError(original, { driver: 'neo4j' });

    expect(error.cause).toBe(original);
    expect(getRootCause(error)).toBe(original);
    expect(error.message).toBe('bad cypher');
    expect(error.metadata).toEqual({ driverCode: 'Neo.ClientError.Statement.SyntaxError' });
    expect(error.attributes).toEqual({ 'db.system': 'neo4j' });
  });

  it('never copies Cypher text or parameters into the error', () => {
    const error = mapDriverError(driverError('Neo.ClientError.Statement.SyntaxError'), {
      driver: 'neo4j',
    });
    const serialized = JSON.stringify(error.metadata ?? {});
    expect(serialized).not.toContain('MATCH');
    expect(serialized).not.toContain('secret-value');
  });

  it('accepts non-Error values thrown by a driver', () => {
    const error = mapDriverError('plain string failure', { driver: 'falkordb' });
    expect(error.code).toBe('query_failed');
    expect(error.message).toBe('plain string failure');
    expect(error.cause).toBe('plain string failure');
  });
});

describe('classifyDriverError', () => {
  it('passes graph-om errors through unchanged', () => {
    const original = graphErrors.create('x', { code: 'record_not_found' });
    expect(classifyDriverError(original, 'neo4j')).toBe(original);
  });

  it('classifies other errors', () => {
    const result = classifyDriverError(driverError(undefined), 'neo4j');
    expect(hasCode(result, 'query_failed')).toBe(true);
  });
});
