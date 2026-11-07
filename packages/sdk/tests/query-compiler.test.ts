// @metal/core/tests/query-compiler.test.ts
import { beforeEach, describe, expect, it } from 'vitest';
import { QueryCompiler } from '../src/query/index';
import type { WhereCondition } from '../src/types';

function createCompiler() {
  return new QueryCompiler();
}

describe('QueryCompiler', () => {
  let compiler: QueryCompiler;

  beforeEach(() => {
    compiler = createCompiler();
  });

  describe('compileFindMany', () => {
    it('generates MATCH with label', () => {
      const result = compiler.compileFindMany('User', {});
      expect(result.cypher).toBe('MATCH (n:User) RETURN n');
      expect(result.params).toEqual({});
    });

    it('includes WHERE clause for simple eq condition', () => {
      const result = compiler.compileFindMany('User', {
        where: { name: 'Alice' },
      });

      expect(result.cypher).toContain('MATCH (n:User)');
      expect(result.cypher).toContain('WHERE n.name = $name1');
      expect(result.cypher).toContain('RETURN n');
      expect(result.params).toEqual({ name1: 'Alice' });
    });

    it('compiles nested AND conditions', () => {
      const result = compiler.compileFindMany('User', {
        where: {
          name: 'Alice',
          age: 30,
        },
      });

      expect(result.cypher).toContain('n.name = $name1');
      expect(result.cypher).toContain('n.age = $age2');
      expect(result.params['name1']).toBe('Alice');
      expect(result.params['age2']).toBe(30);
    });

    it('compiles OR conditions', () => {
      const result = compiler.compileFindMany('User', {
        where: {
          OR: [{ name: 'Alice' }, { name: 'Bob' }],
        },
      });

      expect(result.cypher).toContain('n.name = $name1');
      expect(result.cypher).toContain('n.name = $name2');
      expect(result.params['name1']).toBe('Alice');
      expect(result.params['name2']).toBe('Bob');
    });

    it('compiles NOT conditions', () => {
      const result = compiler.compileFindMany('User', {
        where: {
          NOT: { name: 'Alice' },
        },
      });

      expect(result.cypher).toContain('NOT (');
      expect(result.cypher).toContain('n.name = $name1');
      expect(result.params['name1']).toBe('Alice');
    });

    it('includes ORDER BY clause', () => {
      const result = compiler.compileFindMany('User', {
        orderBy: { name: 'asc' },
      });

      expect(result.cypher).toContain('ORDER BY n.name ASC');
    });

    it('includes LIMIT clause', () => {
      const result = compiler.compileFindMany('User', {
        limit: 10,
      });

      expect(result.cypher).toContain('LIMIT 10');
    });

    it('includes SKIP clause', () => {
      const result = compiler.compileFindMany('User', {
        skip: 5,
      });

      expect(result.cypher).toContain('SKIP 5');
    });

    it('compiles multiple order by fields', () => {
      const result = compiler.compileFindMany('User', {
        orderBy: { name: 'asc', age: 'desc' },
      });

      expect(result.cypher).toContain('ORDER BY n.name ASC, n.age DESC');
    });

    it('generates correct query with all options', () => {
      const result = compiler.compileFindMany('User', {
        where: { name: 'Alice' },
        orderBy: { name: 'asc' },
        limit: 10,
        skip: 5,
      });

      expect(result.cypher).toContain('MATCH (n:User)');
      expect(result.cypher).toContain('WHERE n.name = $name1');
      expect(result.cypher).toContain('RETURN n');
      expect(result.cypher).toContain('ORDER BY n.name ASC');
      expect(result.cypher).toContain('SKIP 5');
      expect(result.cypher).toContain('LIMIT 10');
    });
  });

  describe('compileFindUnique', () => {
    it('generates MATCH with id', () => {
      const nodeConfig = {
        label: 'User' as const,
        properties: {
          id: { type: 'string' as const, primary: true },
          name: { type: 'string' as const },
        },
        relations: {},
      };

      const result = compiler.compileFindUnique('User', { id: 'abc-123' }, nodeConfig);

      expect(result.cypher).toContain('MATCH (n:User {id: $id})');
      expect(result.cypher).toContain('RETURN n');
      expect(result.params).toEqual({ id: 'abc-123' });
    });

    it('generates MATCH with WHERE for non-id conditions', () => {
      const nodeConfig = {
        label: 'User' as const,
        properties: {
          id: { type: 'string' as const, primary: true },
          email: { type: 'string' as const, unique: true },
        },
        relations: {},
      };

      const result = compiler.compileFindUnique('User', { email: 'alice@test.com' }, nodeConfig);

      expect(result.cypher).toContain('MATCH (n:User)');
      expect(result.cypher).toContain('WHERE n.email = $email1');
      expect(result.cypher).toContain('LIMIT 1');
      expect(result.params).toEqual({ email1: 'alice@test.com' });
    });
  });

  describe('compileCreate', () => {
    it('generates CREATE with properties', () => {
      const nodeConfig = {
        label: 'User' as const,
        properties: {
          id: { type: 'string' as const, primary: true },
          name: { type: 'string' as const },
        },
        relations: {},
      };

      const result = compiler.compileCreate('User', { id: 'abc-123', name: 'Alice' }, nodeConfig);

      expect(result.cypher).toContain('CREATE (n:User');
      expect(result.cypher).toContain('id: $id1');
      expect(result.cypher).toContain('name: $name2');
      expect(result.cypher).toContain('RETURN n');
      expect(result.params).toEqual({ id1: 'abc-123', name2: 'Alice' });
    });

    it('generates CREATE without properties if data is empty', () => {
      const nodeConfig = {
        label: 'User' as const,
        properties: {},
        relations: {},
      };

      const result = compiler.compileCreate('User', {}, nodeConfig);

      expect(result.cypher).toBe('CREATE (n:User) RETURN n');
    });
  });

  describe('compileUpdate', () => {
    it('generates MATCH SET with id', () => {
      const nodeConfig = {
        label: 'User' as const,
        properties: {
          id: { type: 'string' as const, primary: true },
          name: { type: 'string' as const },
        },
        relations: {},
      };

      const result = compiler.compileUpdate(
        'User',
        { id: 'abc-123' },
        { name: 'Alice Updated' },
        nodeConfig,
      );

      expect(result.cypher).toContain('MATCH (n:User {id: $matchId})');
      expect(result.cypher).toContain('SET n.name = $name1');
      expect(result.cypher).toContain('RETURN n');
      expect(result.params).toEqual({ matchId: 'abc-123', name1: 'Alice Updated' });
    });

    it('generates MATCH with WHERE for non-id conditions', () => {
      const nodeConfig = {
        label: 'User' as const,
        properties: {
          id: { type: 'string' as const, primary: true },
          email: { type: 'string' as const },
        },
        relations: {},
      };

      const result = compiler.compileUpdate<Record<string, unknown>>(
        'User',
        { email: 'alice@test.com' },
        { name: 'Alice Updated' },
        nodeConfig,
      );

      expect(result.cypher).toContain('MATCH (n:User) WHERE n.email = $email1');
      expect(result.cypher).toContain('SET n.name = $name2');
      expect(result.cypher).toContain('RETURN n');
      expect(result.params).toEqual({ email1: 'alice@test.com', name2: 'Alice Updated' });
    });
  });

  describe('compileDelete', () => {
    it('generates DETACH DELETE with id', () => {
      const nodeConfig = {
        label: 'User' as const,
        properties: { id: { type: 'string' as const, primary: true } },
        relations: {},
      };

      const result = compiler.compileDelete('User', { id: 'abc-123' }, nodeConfig);

      expect(result.cypher).toContain('MATCH (n:User {id: $matchId})');
      expect(result.cypher).toContain('DETACH DELETE n');
      expect(result.params).toEqual({ matchId: 'abc-123' });
    });
  });

  describe('compileAggregate', () => {
    it('generates COUNT query', () => {
      const result = compiler.compileAggregate('User', 'count');

      expect(result.cypher).toContain('MATCH (n:User)');
      expect(result.cypher).toContain('RETURN COUNT(n) AS result');
    });

    it('generates COUNT with WHERE', () => {
      const result = compiler.compileAggregate('User', 'count', undefined, {
        name: 'Alice',
      });

      expect(result.cypher).toContain('WHERE n.name = $name1');
      expect(result.cypher).toContain('RETURN COUNT(n) AS result');
      expect(result.params).toEqual({ name1: 'Alice' });
    });

    it('generates SUM with field', () => {
      const result = compiler.compileAggregate('User', 'sum', 'age');

      expect(result.cypher).toContain('RETURN SUM(n.age) AS result');
    });

    it('generates AVG with field', () => {
      const result = compiler.compileAggregate('User', 'avg', 'age');

      expect(result.cypher).toContain('RETURN AVG(n.age) AS result');
    });
  });

  describe('compileWhere', () => {
    it('handles eq operator', () => {
      const result = compiler.compileWhere({ age: { eq: 25 } });
      expect(result.cypher).toBe('n.age = $age1');
      expect(result.params).toEqual({ age1: 25 });
    });

    it('handles ne operator', () => {
      const result = compiler.compileWhere({ age: { ne: 25 } });
      expect(result.cypher).toBe('n.age <> $age1');
    });

    it('handles gt operator', () => {
      const result = compiler.compileWhere({ age: { gt: 25 } });
      expect(result.cypher).toBe('n.age > $age1');
    });

    it('handles gte operator', () => {
      const result = compiler.compileWhere({ age: { gte: 25 } });
      expect(result.cypher).toBe('n.age >= $age1');
    });

    it('handles lt operator', () => {
      const result = compiler.compileWhere({ age: { lt: 25 } });
      expect(result.cypher).toBe('n.age < $age1');
    });

    it('handles lte operator', () => {
      const result = compiler.compileWhere({ age: { lte: 25 } });
      expect(result.cypher).toBe('n.age <= $age1');
    });

    it('handles contains operator', () => {
      const result = compiler.compileWhere({ name: { contains: 'Ali' } });
      expect(result.cypher).toBe('n.name CONTAINS $name1');
      expect(result.params).toEqual({ name1: 'Ali' });
    });

    it('handles startsWith operator', () => {
      const result = compiler.compileWhere({ name: { startsWith: 'Al' } });
      expect(result.cypher).toBe('n.name STARTS WITH $name1');
    });

    it('handles endsWith operator', () => {
      const result = compiler.compileWhere({ name: { endsWith: 'ce' } });
      expect(result.cypher).toBe('n.name ENDS WITH $name1');
    });

    it('handles in operator', () => {
      const result = compiler.compileWhere({ name: { in: ['Alice', 'Bob'] } });
      expect(result.cypher).toBe('n.name IN $name1');
      expect(result.params).toEqual({ name1: ['Alice', 'Bob'] });
    });

    it('handles notIn operator', () => {
      const result = compiler.compileWhere({ name: { notIn: ['Alice'] } });
      expect(result.cypher).toBe('NOT n.name IN $name1');
    });

    it('returns empty string for undefined where', () => {
      const result = compiler.compileWhere(undefined);
      expect(result.cypher).toBe('');
      expect(result.params).toEqual({});
    });

    it('handles nested not operator', () => {
      const result = compiler.compileWhere({ name: { not: { eq: 'Alice' } } });
      expect(result.cypher).toContain('NOT (n.name = $');
      expect(result.cypher).toContain('n.name');
      expect(result.params).toBeDefined();
      expect(Object.values(result.params)).toContain('Alice');
    });
  });

  describe('compileOrderBy', () => {
    it('generates ORDER BY with asc', () => {
      const result = compiler.compileOrderBy({ name: 'asc' });
      expect(result).toBe('ORDER BY n.name ASC');
    });

    it('generates ORDER BY with desc', () => {
      const result = compiler.compileOrderBy({ name: 'desc' });
      expect(result).toBe('ORDER BY n.name DESC');
    });

    it('returns empty string for undefined', () => {
      const result = compiler.compileOrderBy(undefined);
      expect(result).toBe('');
    });
  });

  describe('compileCreateRelation', () => {
    it('generates CREATE for OUT direction', () => {
      const result = compiler.compileCreateRelation('a1', 'FOLLOWS', 'b1', 'OUT');
      expect(result.cypher).toContain('CREATE (a)-[r:FOLLOWS]->(b)');
      expect(result.params).toEqual({ fromId: 'a1', toId: 'b1' });
    });

    it('generates CREATE for IN direction', () => {
      const result = compiler.compileCreateRelation('a1', 'FOLLOWS', 'b1', 'IN');
      expect(result.cypher).toContain('CREATE (a)<-[r:FOLLOWS]-(b)');
    });

    it('generates CREATE for BOTH direction', () => {
      const result = compiler.compileCreateRelation('a1', 'KNOWS', 'b1', 'BOTH');
      expect(result.cypher).toContain('CREATE (a)-[r:KNOWS]-(b)');
    });

    it('uses elementId() instead of deprecated id()', () => {
      const result = compiler.compileCreateRelation('a1', 'FOLLOWS', 'b1', 'OUT');
      expect(result.cypher).toContain('elementId(a) = $fromId');
      expect(result.cypher).toContain('elementId(b) = $toId');
      expect(result.cypher).not.toContain('id(a)');
      expect(result.cypher).not.toMatch(/\bid\(/);
    });
  });

  describe('compileDeleteRelation', () => {
    it('generates DELETE for OUT direction', () => {
      const result = compiler.compileDeleteRelation('a1', 'FOLLOWS', 'b1', 'OUT');
      expect(result.cypher).toContain('MATCH (a)-[r:FOLLOWS]->(b)');
      expect(result.cypher).toContain('DELETE r');
    });

    it('filters both endpoints by elementId', () => {
      const result = compiler.compileDeleteRelation('a1', 'FOLLOWS', 'b1', 'OUT');
      expect(result.cypher).toContain('elementId(a) = $fromId');
      expect(result.cypher).toContain('elementId(b) = $toId');
      expect(result.params).toEqual({ fromId: 'a1', toId: 'b1' });
    });
  });

  describe('compileUpsert', () => {
    const nodeConfig = {
      label: 'User' as const,
      properties: {
        id: { type: 'string' as const, primary: true },
        name: { type: 'string' as const },
      },
      relations: {},
    };

    it('generates MERGE query', () => {
      const result = compiler.compileUpsert<Record<string, unknown>>(
        'User',
        { id: 'abc-123' },
        { id: 'abc-123', name: 'Alice' },
        { name: 'Alice Updated' },
        nodeConfig,
      );

      expect(result.cypher).toContain('MERGE');
      expect(result.cypher).toContain('ON CREATE');
      expect(result.cypher).toContain('ON MATCH');
      expect(result.cypher).toContain('RETURN n');
    });

    it('MERGEs on the primary key pattern with a parameterized value', () => {
      const result = compiler.compileUpsert<Record<string, unknown>>(
        'User',
        { id: 'abc-123' },
        { id: 'abc-123', name: 'Alice' },
        { name: 'Alice Updated' },
        nodeConfig,
      );

      expect(result.cypher).toContain('MERGE (n:User {id: $mergeKey})');
      expect(result.params['mergeKey']).toBe('abc-123');
    });

    it('emits valid ON CREATE / ON MATCH SET clauses with intact param names', () => {
      const result = compiler.compileUpsert<Record<string, unknown>>(
        'User',
        { id: 'abc-123' },
        { id: 'abc-123', name: 'Alice' },
        { name: 'Alice Updated' },
        nodeConfig,
      );

      expect(result.cypher).toMatch(/ON CREATE SET n\.id = \$c_id\d+, n\.name = \$c_name\d+/);
      expect(result.cypher).toMatch(/ON MATCH SET n\.name = \$u_name\d+/);
      const params = result.params;
      expect(params['mergeKey']).toBe('abc-123');
      expect(Object.values(params)).toContain('abc-123');
      expect(Object.values(params)).toContain('Alice');
      expect(Object.values(params)).toContain('Alice Updated');
    });

    it('accepts eq operator on the primary key', () => {
      const result = compiler.compileUpsert<Record<string, unknown>>(
        'User',
        { id: { eq: 'abc-123' } } as unknown as WhereCondition<Record<string, unknown>> & {
          id?: string;
        },
        { name: 'Alice' },
        { name: 'Updated' },
        nodeConfig,
      );
      expect(result.cypher).toContain('MERGE (n:User {id: $mergeKey})');
      expect(result.params['mergeKey']).toBe('abc-123');
    });

    it('falls back to timestamp defaults when create/update are empty', () => {
      const result = compiler.compileUpsert('User', { id: 'abc-123' }, {}, {}, nodeConfig);
      expect(result.cypher).toContain('ON CREATE SET n.createdAt = datetime()');
      expect(result.cypher).toContain('ON MATCH SET n.updatedAt = datetime()');
    });

    it('throws when where has no primary-key equality', () => {
      expect(() =>
        compiler.compileUpsert(
          'User',
          { name: 'Alice' },
          { name: 'Alice' },
          { name: 'Updated' },
          nodeConfig,
        ),
      ).toThrow(/primary key/);
    });
  });

  describe('compileRaw', () => {
    it('returns raw cypher as-is', () => {
      const result = compiler.compileRaw('MATCH (n) RETURN n LIMIT 10', {});
      expect(result.cypher).toBe('MATCH (n) RETURN n LIMIT 10');
      expect(result.params).toEqual({});
    });

    it('includes params', () => {
      const result = compiler.compileRaw('MATCH (n:User {id: $id}) RETURN n', { id: '123' });
      expect(result.params).toEqual({ id: '123' });
    });
  });

  describe('compilePath', () => {
    it('generates variable-length path query with fromId', () => {
      const result = compiler.compilePath('User', 'FOLLOWS', 'User', {
        fromId: 'abc-123',
        minDepth: 1,
        maxDepth: 3,
      });

      expect(result.cypher).toContain('MATCH (n:User {id: $fromId})');
      expect(result.cypher).toContain('MATCH (n)-[:FOLLOWS*1..3]->(m:User)');
      expect(result.cypher).toContain('RETURN m');
      expect(result.params).toEqual({ fromId: 'abc-123' });
    });

    it('generates variable-length path with OUT direction', () => {
      const result = compiler.compilePath('User', 'FOLLOWS', 'User', {
        fromId: 'abc',
        direction: 'OUT',
        maxDepth: 5,
      });
      expect(result.cypher).toContain('(n)-[:FOLLOWS*1..5]->(m:User)');
    });

    it('generates variable-length path with IN direction', () => {
      const result = compiler.compilePath('User', 'FOLLOWS', 'User', {
        fromId: 'abc',
        direction: 'IN',
        maxDepth: 5,
      });
      expect(result.cypher).toContain('(n)<-[:FOLLOWS*1..5]-(m:User)');
    });

    it('generates variable-length path with BOTH direction', () => {
      const result = compiler.compilePath('User', 'KNOWS', 'User', {
        fromId: 'abc',
        direction: 'BOTH',
      });
      expect(result.cypher).toContain('(n)-[:KNOWS*1..3]-(m:User)');
    });

    it('handles where conditions on start node', () => {
      const result = compiler.compilePath('User', 'FOLLOWS', 'User', {
        fromWhere: { name: 'Alice' },
      });

      expect(result.cypher).toContain('WHERE n.name = $name1');
      expect(result.params).toEqual({ name1: 'Alice' });
    });

    it('includes LIMIT when specified', () => {
      const result = compiler.compilePath('User', 'FOLLOWS', 'User', {
        fromId: 'abc',
        limit: 10,
      });
      expect(result.cypher).toContain('LIMIT 10');
    });
  });

  describe('compileShortestPath', () => {
    it('generates shortestPath query with fromId and toId', () => {
      const result = compiler.compileShortestPath('User', 'FOLLOWS', 'User', {
        fromId: 'abc',
        toId: 'xyz',
      });

      expect(result.cypher).toContain('MATCH (n:User {id: $fromId})');
      expect(result.cypher).toContain('MATCH (m:User {id: $toId})');
      expect(result.cypher).toContain('shortestPath((');
      expect(result.cypher).toContain('AS path');
      expect(result.params).toEqual({ fromId: 'abc', toId: 'xyz' });
    });

    it('generates shortestPath with OUT direction', () => {
      const result = compiler.compileShortestPath('User', 'FOLLOWS', 'User', {
        fromId: 'a',
        toId: 'b',
        direction: 'OUT',
      });
      expect(result.cypher).toContain('shortestPath((n)-[:FOLLOWS*1..');
    });

    it('generates shortestPath with custom maxDepth', () => {
      const result = compiler.compileShortestPath('User', 'FOLLOWS', 'User', {
        fromId: 'a',
        toId: 'b',
        maxDepth: 6,
      });
      expect(result.cypher).toContain('*1..6]');
    });

    it('handles where conditions on start and end nodes', () => {
      const result = compiler.compileShortestPath('User', 'FOLLOWS', 'User', {
        fromWhere: { name: 'Alice' },
        toWhere: { name: 'Bob' },
      });

      expect(result.cypher).toContain('n.name = $name1');
      expect(result.cypher).toContain('m.name = $name2');
    });
  });

  describe('compileAllShortestPaths', () => {
    it('generates allShortestPaths query', () => {
      const result = compiler.compileAllShortestPaths('User', 'FOLLOWS', 'User', {
        fromId: 'abc',
        toId: 'xyz',
      });

      expect(result.cypher).toContain('allShortestPaths((');
      expect(result.cypher).toContain('AS path');
      expect(result.params).toEqual({ fromId: 'abc', toId: 'xyz' });
    });
  });
});
