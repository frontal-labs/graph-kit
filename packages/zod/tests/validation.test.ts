// @metal/zod/tests/validation.test.ts
import { describe, expect, it } from 'vitest';
import {
  toCreateSchema,
  toUpdateSchema,
  toZodSchema,
  validateCreate,
  validateUpdate,
  validationHooks,
} from '../src/index';

const mockNodeConfig = {
  label: 'User' as const,
  properties: {
    id: { type: 'string' as const, primary: true },
    name: { type: 'string' as const },
    email: { type: 'string' as const, unique: true },
    age: { type: 'number' as const, nullable: true },
    score: { type: 'float' as const, default: 0 },
  },
  relations: {},
};

describe('toZodSchema', () => {
  it('generates a valid Zod schema for a node config', () => {
    const schema = toZodSchema(mockNodeConfig);
    expect(schema).toBeDefined();
    expect(schema.shape).toHaveProperty('id');
    expect(schema.shape).toHaveProperty('name');
    expect(schema.shape).toHaveProperty('email');
    expect(schema.shape).toHaveProperty('age');
  });

  it('parses valid data correctly', () => {
    const schema = toZodSchema(mockNodeConfig);
    const result = schema.parse({
      id: 'abc-123',
      name: 'Alice',
      email: 'alice@test.com',
      age: 30,
      score: 100,
    }) as { id: string; name: string; email: string; age: number | null };

    expect(result.id).toBe('abc-123');
    expect(result.name).toBe('Alice');
    expect(result.email).toBe('alice@test.com');
    expect(result.age).toBe(30);
  });

  it('rejects invalid data', () => {
    const schema = toZodSchema(mockNodeConfig);
    expect(() => schema.parse({ id: 123, name: 456 })).toThrow();
  });

  it('allows nullable fields to be null', () => {
    const schema = toZodSchema(mockNodeConfig);
    const result = schema.parse({
      id: 'abc',
      name: 'Alice',
      email: 'alice@test.com',
      age: null,
    }) as { age: number | null };

    expect(result.age).toBeNull();
  });

  it('treats array + nullable as T[] | null (not (T|null)[])', () => {
    const config = {
      label: 'Post' as const,
      properties: {
        id: { type: 'string' as const, primary: true },
        tags: { type: 'string' as const, array: true, nullable: true },
      },
      relations: {},
    };
    const schema = toZodSchema(config);

    const arr = schema.parse({ id: '1', tags: ['a', 'b'] }) as { tags: string[] | null };
    expect(arr.tags).toEqual(['a', 'b']);

    const nul = schema.parse({ id: '1', tags: null }) as { tags: string[] | null };
    expect(nul.tags).toBeNull();

    expect(() => schema.parse({ id: '1', tags: [1, 2] })).toThrow();
  });

  it('maps uuid and json property types', () => {
    const config = {
      label: 'Token' as const,
      properties: {
        id: { type: 'uuid' as const, primary: true },
        payload: { type: 'json' as const },
      },
      relations: {},
    };
    const schema = toZodSchema(config);
    expect(() => schema.parse({ id: 'not-a-uuid', payload: {} })).toThrow();
    expect(schema.parse({ id: '550e8400-e29b-41d4-a716-446655440000', payload: { a: 1 } })).toEqual(
      {
        id: '550e8400-e29b-41d4-a716-446655440000',
        payload: { a: 1 },
      },
    );
  });
});

describe('toCreateSchema', () => {
  it('allows optional fields with defaults', () => {
    const schema = toCreateSchema(mockNodeConfig);
    const result = schema.parse({
      id: 'abc',
      name: 'Alice',
      email: 'alice@test.com',
    }) as { id: string; name: string; score: number };

    expect(result.id).toBe('abc');
    expect(result.name).toBe('Alice');
    expect(result.score).toBe(0);
  });

  it('does not require nullable fields', () => {
    const schema = toCreateSchema(mockNodeConfig);
    const result = schema.parse({
      id: 'abc',
      name: 'Alice',
      email: 'alice@test.com',
    }) as { age?: number | null };

    expect(result.age).toBeUndefined();
  });
});

describe('validateCreate', () => {
  it('returns success for valid data', () => {
    const result = validateCreate(mockNodeConfig, {
      id: 'abc',
      name: 'Alice',
      email: 'alice@test.com',
    });

    expect(result.success).toBe(true);
  });

  it('returns error for invalid data', () => {
    const result = validateCreate(mockNodeConfig, {
      id: 'abc',
      name: 'Alice',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeDefined();
    }
  });
});

describe('validateUpdate', () => {
  it('returns success with partial data', () => {
    const result = validateUpdate(mockNodeConfig, {
      name: 'Alice Updated',
    });

    expect(result.success).toBe(true);
  });

  it('does not allow updating primary key', () => {
    const schema = toUpdateSchema(mockNodeConfig);
    expect(schema.shape).not.toHaveProperty('id');
  });
});

describe('validationHooks', () => {
  it('creates beforeCreate hook', () => {
    const hooks = validationHooks(mockNodeConfig);
    expect(hooks.beforeCreate).toBeDefined();
    expect(() => hooks.beforeCreate?.({})).toThrow();
  });

  it('beforeCreate validates and returns data', () => {
    const hooks = validationHooks(mockNodeConfig);
    const data = hooks.beforeCreate?.({
      id: 'abc',
      name: 'Alice',
      email: 'alice@test.com',
    });
    expect(data).toBeDefined();
  });

  it('creates beforeUpdate hook', () => {
    const hooks = validationHooks(mockNodeConfig);
    expect(hooks.beforeUpdate).toBeDefined();
  });
});
