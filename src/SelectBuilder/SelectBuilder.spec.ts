import { describe, expect, it, spyOn } from 'bun:test';
import SelectBuilder, { type FieldName } from './SelectBuilder';

const trim = (s: string) => s.replace(/\s+/g, ' ').trim();

describe('class', () => {
  it('should be instantiable', () => {
    const query = new SelectBuilder();
    expect(query).toBeInstanceOf(SelectBuilder);
  });
});
describe('where() with arguments', () => {
  it('should parse simple queries', () => {
    const query = new SelectBuilder('SELECT * FROM users');
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe('SELECT * FROM users');
    expect(bindings).toEqual([]);
  });
  it('should accept bindings', () => {
    const query = new SelectBuilder('SELECT * FROM users WHERE id = :id', {
      id: 123,
    });
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe('SELECT * FROM users WHERE id = ?');
    expect(bindings).toEqual([123]);
  });
  it('should allow pg-style placeholders', () => {
    const query = new SelectBuilder(
      'SELECT * FROM users WHERE id = :id AND age >= :age',
      {
        age: 18,
        id: 123,
      }
    );
    const { sql, bindings } = query.compile({ engine: 'pg' });
    expect(trim(sql)).toBe('SELECT * FROM users WHERE id = $1 AND age >= $2');
    expect(bindings).toEqual([123, 18]);
  });
  it('should handle expressions', () => {
    const query = new SelectBuilder();
    query.column('mycol');
    query.from('mytable');
    query.where('mycol = LOWER(mycol2)');
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe(
      'SELECT mycol FROM mytable WHERE mycol = LOWER(mycol2)'
    );
    expect(bindings).toEqual([]);
  });
  it('should handle equals', () => {
    const query = new SelectBuilder('SELECT * FROM users');
    query.where('id', 123);
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe('SELECT * FROM users WHERE id = ?');
    expect(bindings).toEqual([123]);
  });
  it('should keep binding order', () => {
    const query = new SelectBuilder('SELECT * FROM users');
    query.where('id', 123);
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe('SELECT * FROM users WHERE id = ?');
    expect(bindings).toEqual([123]);
  });
  it('should handle IN', () => {
    const query = new SelectBuilder('SELECT * FROM users');
    query.where('id', 'IN', [1, 2]);
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe('SELECT * FROM users WHERE id IN(?, ?)');
    expect(bindings).toEqual([1, 2]);
  });
  it('should handle equals as IN', () => {
    const query = new SelectBuilder('SELECT * FROM users');
    query.where('id', '=', [1, 2]);
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe('SELECT * FROM users WHERE id IN(?, ?)');
    expect(bindings).toEqual([1, 2]);
  });
  it('should handle automatic IN', () => {
    const query = new SelectBuilder('SELECT * FROM users');
    query.where('id', [1, 2]);
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe('SELECT * FROM users WHERE id IN(?, ?)');
    expect(bindings).toEqual([1, 2]);
  });
  it('should handle NOT IN', () => {
    const query = new SelectBuilder('SELECT * FROM users');
    query.where('id', 'NOT IN', [1, 2]);
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe('SELECT * FROM users WHERE id NOT IN(?, ?)');
    expect(bindings).toEqual([1, 2]);
  });
  it('should handle != as NOT IN', () => {
    const query = new SelectBuilder('SELECT * FROM users');
    query.where('id', '!=', [1, 2]);
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe('SELECT * FROM users WHERE id NOT IN(?, ?)');
    expect(bindings).toEqual([1, 2]);
  });
  it('should handle <> as NOT IN', () => {
    const query = new SelectBuilder('SELECT * FROM users');
    query.where('id', '<>', [1, 2]);
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe('SELECT * FROM users WHERE id NOT IN(?, ?)');
    expect(bindings).toEqual([1, 2]);
  });
  it('should omit IN when array is empty', () => {
    const query = new SelectBuilder('SELECT * FROM users');
    query.where('id', 'IN', []);
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe('SELECT * FROM users');
    expect(bindings).toEqual([]);
  });
  it('should omit automatic IN when array is empty', () => {
    const query = new SelectBuilder('SELECT * FROM users');
    query.where('id', []);
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe('SELECT * FROM users');
    expect(bindings).toEqual([]);
  });
  it('should omit "column operator" pair when array is empty', () => {
    const query = new SelectBuilder('SELECT * FROM users');
    query.where('id NOT IN', []);
    query.where('id !=', []);
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe('SELECT * FROM users');
    expect(bindings).toEqual([]);
  });
  it('should omit NOT IN when array is empty', () => {
    const query = new SelectBuilder('SELECT * FROM users');
    query.where('id', 'NOT IN', []);
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe('SELECT * FROM users');
    expect(bindings).toEqual([]);
  });
  it('should omit empty IN but keep other conditions', () => {
    const query = new SelectBuilder('SELECT * FROM users');
    query.where('is_active', 1);
    query.where({ status: [], 'age >': 18 });
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe(
      'SELECT * FROM users WHERE is_active = ? AND age > ?'
    );
    expect(bindings).toEqual([1, 18]);
  });
  it('should handle explicit IN (not an array)', () => {
    const query = new SelectBuilder('SELECT * FROM users');
    query.where('id', 'NOT IN', 456);
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe('SELECT * FROM users WHERE id NOT IN(?)');
    expect(bindings).toEqual([456]);
  });
  it('should handle BETWEEN', () => {
    const query = new SelectBuilder('SELECT * FROM users');
    query.where('age', 'BETWEEN', [18, 35]);
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe('SELECT * FROM users WHERE age BETWEEN ? AND ?');
    expect(bindings).toEqual([18, 35]);
  });
  it('should handle comparison operators', () => {
    const query = new SelectBuilder('SELECT * FROM users');
    query.where('age', '>=', 18);
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe('SELECT * FROM users WHERE age >= ?');
    expect(bindings).toEqual([18]);
  });
  it('should handle null', () => {
    const query = new SelectBuilder('SELECT * FROM users');
    query.where('deleted_at', null);
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe('SELECT * FROM users WHERE deleted_at IS NULL');
    expect(bindings).toEqual([]);
  });
  it('should handle equals null', () => {
    const query = new SelectBuilder('SELECT * FROM users');
    query.where('deleted_at', '=', null);
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe('SELECT * FROM users WHERE deleted_at IS NULL');
    expect(bindings).toEqual([]);
  });
  it('should handle not null', () => {
    const query = new SelectBuilder('SELECT * FROM users');
    query.where('deleted_at', 'not', null);
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe('SELECT * FROM users WHERE deleted_at IS NOT NULL');
    expect(bindings).toEqual([]);
  });
  it('should handle != null', () => {
    const query = new SelectBuilder('SELECT * FROM users');
    query.where('deleted_at', '!=', null);
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe('SELECT * FROM users WHERE deleted_at IS NOT NULL');
    expect(bindings).toEqual([]);
  });
  it('should handle LIKE with no infix', () => {
    const query = new SelectBuilder('SELECT * FROM users');
    query.where('fname', 'like', 'John');
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe('SELECT * FROM users WHERE fname LIKE ?');
    expect(bindings).toEqual(['John']);
  });
  it('should handle LIKE with array', () => {
    const query = new SelectBuilder('SELECT * FROM users');
    query.where('fname', 'LIKE', ['Chip', 'John']);
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe(
      'SELECT * FROM users WHERE (fname LIKE ? OR fname LIKE ?)'
    );
    expect(bindings).toEqual(['Chip', 'John']);
  });
  it('should handle LIKE with ?% infix', () => {
    const query = new SelectBuilder('SELECT * FROM users');
    query.where('fname', 'LIKE ?%', 'Tim');
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe('SELECT * FROM users WHERE fname LIKE ?');
    expect(bindings).toEqual(['Tim%']);
  });
  it('should handle LIKE with %? infix', () => {
    const query = new SelectBuilder('SELECT * FROM users');
    query.where('lname', 'LIKE %?', 'son');
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe('SELECT * FROM users WHERE lname LIKE ?');
    expect(bindings).toEqual(['%son']);
  });
  it('should handle LIKE with %?% infix', () => {
    const query = new SelectBuilder('SELECT * FROM users');
    query.where('lname', 'LIKE %?%', 'son');
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe('SELECT * FROM users WHERE lname LIKE ?');
    expect(bindings).toEqual(['%son%']);
  });
  it('should not treat $ patterns in LIKE values as replacement patterns', () => {
    const query = new SelectBuilder('SELECT * FROM users');
    query.where('name', 'LIKE %?%', "a$&b$'c");
    query.where('nick', 'LIKE ?%', ['x$`y', 'z$$']);
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe(
      'SELECT * FROM users WHERE name LIKE ? AND (nick LIKE ? OR nick LIKE ?)'
    );
    expect(bindings).toEqual(["%a$&b$'c%", 'x$`y%', 'z$$%']);
  });
  it('should handle explicit question marks (2 args)', () => {
    const query = new SelectBuilder();
    query.table('users');
    query.where('SUBSTR(prefs, ?, ?) = role', [1, 4]);
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe(
      'SELECT * FROM users WHERE SUBSTR(prefs, ?, ?) = role'
    );
    expect(bindings).toEqual([1, 4]);
  });
  it("should not mutate the caller's bindings array for ? placeholders", () => {
    const query = new SelectBuilder('SELECT * FROM users');
    const values = [1, 2];
    query.where('a = ? AND b = ?', values);
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe('SELECT * FROM users WHERE a = ? AND b = ?');
    expect(bindings).toEqual([1, 2]);
    expect(values).toEqual([1, 2]);
  });
  it('should handle subqueries with empty bindings', () => {
    // .where('col IN (SELECT ...)', [])
    const query = new SelectBuilder();
    query.table('contact');
    query.where('mobile_id IN (SELECT id FROM phone)', []);
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe(
      'SELECT * FROM contact WHERE mobile_id IN (SELECT id FROM phone)'
    );
    expect(bindings).toEqual([]);
  });
  it('should handle where with objects', () => {
    const query = new SelectBuilder();
    query.table('users');
    query.where({ age: 18 });
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe('SELECT * FROM users WHERE age = ?');
    expect(bindings).toEqual([18]);
  });
  it('should handle where with objects with >=', () => {
    const query = new SelectBuilder();
    query.table('users');
    query.where({ 'age >=': 18 });
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe('SELECT * FROM users WHERE age >= ?');
    expect(bindings).toEqual([18]);
  });
  it('should handle where with objects with BETWEEN', () => {
    const query = new SelectBuilder();
    query.table('users');
    query.where({ 'age BETWEEN': [18, 35] });
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe('SELECT * FROM users WHERE age BETWEEN ? AND ?');
    expect(bindings).toEqual([18, 35]);
  });
  it('should handle where with objects with LIKE', () => {
    const query = new SelectBuilder();
    query.table('users');
    query.where({ 'name LIKE ?%': 'Tim' });
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe('SELECT * FROM users WHERE name LIKE ?');
    expect(bindings).toEqual(['Tim%']);
  });
  it('should handle where with objects with IN', () => {
    const query = new SelectBuilder();
    query.table('users');
    query.where({ 'abilities IN': ['view', 'edit'] });
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe('SELECT * FROM users WHERE abilities IN(?, ?)');
    expect(bindings).toEqual(['view', 'edit']);
  });
  it('should handle where with objects with implicit IN', () => {
    const query = new SelectBuilder();
    query.table('users');
    query.where({ abilities: ['view', 'edit'] });
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe('SELECT * FROM users WHERE abilities IN(?, ?)');
    expect(bindings).toEqual(['view', 'edit']);
  });
});
describe('orWhere()', () => {
  it('should handle arrays', () => {
    const query = new SelectBuilder();
    query.table('users');
    query.orWhere([
      ['a', '>', 1],
      ['b', 2],
    ]);
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe('SELECT * FROM users WHERE (a > ? OR b = ?)');
    expect(bindings).toEqual([1, 2]);
  });
  it('should handle array of objects', () => {
    const query = new SelectBuilder();
    query.table('users');
    query.orWhere([{ 'a >': 1 }, { b: 2 }]);
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe('SELECT * FROM users WHERE (a > ? OR b = ?)');
    expect(bindings).toEqual([1, 2]);
  });
  it('should handle an object', () => {
    const query = new SelectBuilder();
    query.table('users');
    query.orWhere({ 'a >': 1, b: 2 });
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe('SELECT * FROM users WHERE (a > ? OR b = ?)');
    expect(bindings).toEqual([1, 2]);
  });
  it('should omit empty IN inside OR', () => {
    const query = new SelectBuilder();
    query.table('users');
    query.orWhere({ a: [], b: 2 });
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe('SELECT * FROM users WHERE (b = ?)');
    expect(bindings).toEqual([2]);
  });
  it('should omit the whole OR when every condition is an empty IN', () => {
    const query = new SelectBuilder();
    query.table('users');
    query.orWhere([
      ['a', 'IN', []],
      ['b', []],
    ]);
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe('SELECT * FROM users');
    expect(bindings).toEqual([]);
  });
  it('should keep the OR group parenthesized when items start and end with parens', () => {
    const query = new SelectBuilder('SELECT * FROM t WHERE tenant_id = 5');
    query.orWhere([
      ['name', 'LIKE', ['a', 'b']],
      ['id', [1, 2]],
    ]);
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe(
      'SELECT * FROM t WHERE tenant_id = 5 AND ((name LIKE ? OR name LIKE ?) OR id IN(?, ?))'
    );
    expect(bindings).toEqual(['a', 'b', 1, 2]);
  });
  it('should keep the OR group parenthesized with parenthesized string expressions', () => {
    const query = new SelectBuilder('SELECT * FROM t WHERE tenant_id = 5');
    query.orWhere(['(a = 1 AND b = 2)', '(c = 3 AND d = 4)']);
    const { sql } = query.compile();
    expect(trim(sql)).toBe(
      'SELECT * FROM t WHERE tenant_id = 5 AND ((a = 1 AND b = 2) OR (c = 3 AND d = 4))'
    );
  });
  it('should ignore parens inside quoted strings when checking the OR group', () => {
    const query = new SelectBuilder('SELECT * FROM t WHERE tenant_id = 5');
    query.orWhere(["(a = '(') OR (b = ')')"]);
    const { sql } = query.compile();
    expect(trim(sql)).toBe(
      "SELECT * FROM t WHERE tenant_id = 5 AND ((a = '(') OR (b = ')'))"
    );
  });
  it('should not double-wrap a single fully-parenthesized item', () => {
    const query = new SelectBuilder('SELECT * FROM t WHERE tenant_id = 5');
    query.orWhere([['name', 'LIKE', ['a', 'b']]]);
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe(
      'SELECT * FROM t WHERE tenant_id = 5 AND (name LIKE ? OR name LIKE ?)'
    );
    expect(bindings).toEqual(['a', 'b']);
  });
  it('should treat each object in an array as an AND group', () => {
    const query = new SelectBuilder('SELECT * FROM users');
    query.orWhere([{ a: 1, b: 2 }, { c: 3 }]);
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe(
      'SELECT * FROM users WHERE ((a = ? AND b = ?) OR c = ?)'
    );
    expect(bindings).toEqual([1, 2, 3]);
  });
  it('should not add parens for single-key objects in an array', () => {
    const query = new SelectBuilder('SELECT * FROM users');
    query.orWhere([{ approved_at: null }, { denied_at: null }]);
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe(
      'SELECT * FROM users WHERE (approved_at IS NULL OR denied_at IS NULL)'
    );
    expect(bindings).toEqual([]);
  });
  it('should OR each key of a plain object', () => {
    const query = new SelectBuilder('SELECT * FROM users');
    query.orWhere({ approved_at: null, denied_at: null });
    const { sql } = query.compile();
    expect(trim(sql)).toBe(
      'SELECT * FROM users WHERE (approved_at IS NULL OR denied_at IS NULL)'
    );
  });
  it('should parenthesize OR expressions inside an AND group', () => {
    const query = new SelectBuilder('SELECT * FROM users');
    query.orWhere([{ 'a = ? OR b = ?': [1, 2], c: 3 }, { d: 4 }]);
    query.orWhere([{ 'name LIKE': ['x', 'y'], active: true }]);
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe(
      'SELECT * FROM users WHERE (((a = ? OR b = ?) AND c = ?) OR d = ?) AND ((name LIKE ? OR name LIKE ?) AND active = ?)'
    );
    expect(bindings).toEqual([1, 2, 3, 4, 'x', 'y', true]);
  });
  it('should drop omitted conditions from AND groups without leaving empty parens', () => {
    const query = new SelectBuilder('SELECT * FROM users');
    query.orWhere([{ a: [], b: 2 }, { c: [] }, { d: 4, e: 5 }]);
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe(
      'SELECT * FROM users WHERE (b = ? OR (d = ? AND e = ?))'
    );
    expect(bindings).toEqual([2, 4, 5]);
  });
  it('should omit the whole OR when every object in the array is empty', () => {
    const query = new SelectBuilder('SELECT * FROM users');
    query.orWhere([{ a: [] }, { b: [], c: [] }, {}]);
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe('SELECT * FROM users');
    expect(bindings).toEqual([]);
  });
});
describe('having()', () => {
  it('should handle expression', () => {
    const query = new SelectBuilder(
      'SELECT user_id, SUM(size) FROM media GROUP BY user_id'
    );
    query.having('SUM(size) > 1024 * 1024');
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe(
      'SELECT user_id, SUM(size) FROM media GROUP BY user_id HAVING SUM(size) > 1024 * 1024'
    );
    expect(bindings).toEqual([]);
  });
  it('should handle binding with operator', () => {
    const query = new SelectBuilder(
      'SELECT user_id, SUM(size) FROM media GROUP BY user_id'
    );
    query.having('SUM(size)', '>', 1024 * 1024);
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe(
      'SELECT user_id, SUM(size) FROM media GROUP BY user_id HAVING SUM(size) > ?'
    );
    expect(bindings).toEqual([1024 * 1024]);
  });
  it('should handle binding', () => {
    const query = new SelectBuilder(
      'SELECT user_id, SUM(size) FROM media GROUP BY user_id'
    );
    query.having('SUM(size) >', 1024 * 1024);
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe(
      'SELECT user_id, SUM(size) FROM media GROUP BY user_id HAVING SUM(size) > ?'
    );
    expect(bindings).toEqual([1024 * 1024]);
  });
  it('should handle binding with implicit operator', () => {
    const query = new SelectBuilder(
      'SELECT user_id, SUM(size) FROM media GROUP BY user_id'
    );
    query.having('SUM(size)', 1024 * 1024);
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe(
      'SELECT user_id, SUM(size) FROM media GROUP BY user_id HAVING SUM(size) = ?'
    );
    expect(bindings).toEqual([1024 * 1024]);
  });
  it('should handle object binding', () => {
    const query = new SelectBuilder(
      'SELECT user_id, SUM(size) FROM media GROUP BY user_id'
    );
    query.having({ 'SUM(size) >': 1024 * 1024 });
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe(
      'SELECT user_id, SUM(size) FROM media GROUP BY user_id HAVING SUM(size) > ?'
    );
    expect(bindings).toEqual([1024 * 1024]);
  });
  it('should handle 2 args with implicit equals', () => {
    const query = new SelectBuilder(
      `
      SELECT 
        user_id,
        COUNT(*) 
      FROM media
      LEFT JOIN posts ON posts.user_id = media.user_id
      GROUP BY user_id
`
    );
    query.having('COUNT(*)', 0);
    const { sql, bindings } = query.compile();
    expect(sql).toBe(
      `
SELECT
  user_id,
  COUNT(*)
FROM media
LEFT JOIN posts ON posts.user_id = media.user_id
GROUP BY user_id
HAVING COUNT(*) = ?`.trim()
    );
    expect(bindings).toEqual([0]);
  });
  it('should handle 2 args with operator', () => {
    const query = new SelectBuilder(
      'SELECT user_id, SUM(size) FROM media GROUP BY user_id'
    );
    query.having('SUM(size) <=', 1024 * 1024);
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe(
      'SELECT user_id, SUM(size) FROM media GROUP BY user_id HAVING SUM(size) <= ?'
    );
    expect(bindings).toEqual([1024 * 1024]);
  });
  it('should handle 3 args', () => {
    const query = new SelectBuilder(
      'SELECT user_id, SUM(size) FROM media GROUP BY user_id'
    );
    query.having('SUM(size)', '<=', 1024 * 1024);
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe(
      'SELECT user_id, SUM(size) FROM media GROUP BY user_id HAVING SUM(size) <= ?'
    );
    expect(bindings).toEqual([1024 * 1024]);
  });
  it('should handle an object', () => {
    const query = new SelectBuilder(
      'SELECT user_id, SUM(size) FROM media GROUP BY user_id'
    );
    query.having({ 'SUM(size) <=': 1024 * 1024 });
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe(
      'SELECT user_id, SUM(size) FROM media GROUP BY user_id HAVING SUM(size) <= ?'
    );
    expect(bindings).toEqual([1024 * 1024]);
  });
});
describe('orHaving()', () => {
  it('should handle strings', () => {
    const query = new SelectBuilder(
      'SELECT user_id, SUM(size) FROM media GROUP BY user_id'
    );
    query.orHaving([['SUM(size) > 1024'], ['SUM(size) < 4096']]);
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe(
      'SELECT user_id, SUM(size) FROM media GROUP BY user_id HAVING (SUM(size) > 1024 OR SUM(size) < 4096)'
    );
    expect(bindings).toEqual([]);
  });
  it('should handle objects', () => {
    const query = new SelectBuilder(
      'SELECT user_id, SUM(size) FROM media GROUP BY user_id'
    );
    query.orHaving([{ 'SUM(size) >': 1024 }, { 'SUM(size) <': 4096 }]);
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe(
      'SELECT user_id, SUM(size) FROM media GROUP BY user_id HAVING (SUM(size) > ? OR SUM(size) < ?)'
    );
    expect(bindings).toEqual([1024, 4096]);
  });
  it('should keep the OR group parenthesized when items start and end with parens', () => {
    const query = new SelectBuilder(
      'SELECT user_id, SUM(size) FROM media GROUP BY user_id HAVING COUNT(*) > 1'
    );
    query.orHaving([
      ['(SUM(size) > 1024 AND SUM(size) < 2048)'],
      ['(SUM(size) > 4096 AND SUM(size) < 8192)'],
    ]);
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe(
      'SELECT user_id, SUM(size) FROM media GROUP BY user_id HAVING COUNT(*) > 1 AND ((SUM(size) > 1024 AND SUM(size) < 2048) OR (SUM(size) > 4096 AND SUM(size) < 8192))'
    );
    expect(bindings).toEqual([]);
  });
  it('should treat each object in an array as an AND group', () => {
    const query = new SelectBuilder(
      'SELECT user_id, SUM(size) FROM media GROUP BY user_id'
    );
    query.orHaving([
      { 'SUM(size) >': 1024, 'COUNT(*) >': 2 },
      { 'SUM(size) <': 10 },
    ]);
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe(
      'SELECT user_id, SUM(size) FROM media GROUP BY user_id HAVING ((SUM(size) > ? AND COUNT(*) > ?) OR SUM(size) < ?)'
    );
    expect(bindings).toEqual([1024, 2, 10]);
  });
});
describe('whereBetween()', () => {
  it('should handle whereBetween', () => {
    const query = new SelectBuilder('SELECT * FROM users');
    query.whereBetween('age', [18, 35]);
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe('SELECT * FROM users WHERE age BETWEEN ? AND ?');
    expect(bindings).toEqual([18, 35]);
  });
  it('should handle whereBetween with left value only', () => {
    const query = new SelectBuilder('SELECT * FROM users');
    query.whereBetween('age', [18, null]);
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe('SELECT * FROM users WHERE age >= ?');
    expect(bindings).toEqual([18]);
  });
  it('should handle whereBetween with right value only', () => {
    const query = new SelectBuilder('SELECT * FROM users');
    query.whereBetween('age', [null, 35]);
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe('SELECT * FROM users WHERE age <= ?');
    expect(bindings).toEqual([35]);
  });
  it('should omit expression if whereBetween has no values', () => {
    const query = new SelectBuilder('SELECT * FROM users');
    query.whereBetween('age', [null, null]);
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe('SELECT * FROM users');
    expect(bindings).toEqual([]);
  });
  it('should handle whereBetween with strings', () => {
    const query = new SelectBuilder('SELECT * FROM users');
    query.whereBetween('created_at', ['2026-08-01', '2026-08-31']);
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe(
      'SELECT * FROM users WHERE created_at BETWEEN ? AND ?'
    );
    expect(bindings).toEqual(['2026-08-01', '2026-08-31']);
  });
});
describe('sortField()', () => {
  it('should handle simple columns', () => {
    const query = new SelectBuilder('SELECT * FROM posts');
    query.sortField('created_at', { created_at: 'posts.created_at' });
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe('SELECT * FROM posts ORDER BY posts.created_at ASC');
    expect(bindings).toEqual([]);
  });
  it('should handle minus signs', () => {
    const query = new SelectBuilder('SELECT * FROM posts');
    query.sortField('-created_at', { created_at: 'posts.created_at' });
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe(
      'SELECT * FROM posts ORDER BY posts.created_at DESC'
    );
    expect(bindings).toEqual([]);
  });
  it('should warn and skip fields not in mapNames', () => {
    const warn = spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const query = new SelectBuilder('SELECT * FROM posts');
      query.sortField('id; DROP TABLE posts', {
        created_at: 'posts.created_at',
      });
      query.sortField('-id; DROP TABLE posts', {
        created_at: 'posts.created_at',
      });
      query.sortField('posts.created_at');
      const { sql, bindings } = query.compile();
      expect(trim(sql)).toBe('SELECT * FROM posts');
      expect(bindings).toEqual([]);
      expect(warn).toHaveBeenCalledTimes(3);
      expect(warn.mock.calls[0][0]).toContain('id; DROP TABLE posts');
    } finally {
      warn.mockRestore();
    }
  });
  it('should ignore inherited object properties', () => {
    const warn = spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const query = new SelectBuilder('SELECT * FROM posts');
      query.sortField('constructor', { created_at: 'posts.created_at' });
      const { sql } = query.compile();
      expect(trim(sql)).toBe('SELECT * FROM posts');
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });
  it('should handle mapping', () => {
    const query = new SelectBuilder('SELECT * FROM posts');
    query.sortField('-created_at', {
      created_at: 'posts.created_timestamp',
    });
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe(
      'SELECT * FROM posts ORDER BY posts.created_timestamp DESC'
    );
    expect(bindings).toEqual([]);
  });
  it('should handle mapping with COLLATE', () => {
    const query = new SelectBuilder('SELECT * FROM posts');
    query.sortField('-name', {
      name: 'name COLLATE "jp_JP"',
    });
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe(
      'SELECT * FROM posts ORDER BY name COLLATE "jp_JP" DESC'
    );
    expect(bindings).toEqual([]);
  });
  it('should handle mapping with modifiers', () => {
    const query = new SelectBuilder('SELECT * FROM posts');
    query.sortField(
      '-created_at',
      {
        created_at: 'posts.created_timestamp',
      },
      'NULLS LAST'
    );
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe(
      'SELECT * FROM posts ORDER BY posts.created_timestamp DESC NULLS LAST'
    );
    expect(bindings).toEqual([]);
  });
  it('should handle maps with minuses', () => {
    const query = new SelectBuilder('SELECT * FROM posts');
    query.sortField('-created_at', {
      created_at: 'posts.created_timestamp',
      '-created_at': 'posts.created_timestamp DESC NULLS LAST',
    });
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe(
      'SELECT * FROM posts ORDER BY posts.created_timestamp DESC NULLS LAST'
    );
    expect(bindings).toEqual([]);
  });
  it('should handle null fields', () => {
    const query = new SelectBuilder('SELECT * FROM posts');
    query.sortField(null, {
      created_at: 'posts.created_timestamp',
      '-created_at': 'posts.created_timestamp DESC NULLS LAST',
    });
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe('SELECT * FROM posts');
    expect(bindings).toEqual([]);
  });
});
describe('orderBy()', () => {
  it('should handle simple columns', () => {
    const query = new SelectBuilder('SELECT * FROM posts');
    query.orderBy('posts.created_at');
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe('SELECT * FROM posts ORDER BY posts.created_at');
    expect(bindings).toEqual([]);
  });
  it('should handle simple columns with DESC', () => {
    const query = new SelectBuilder('SELECT * FROM posts');
    query.orderBy('posts.created_at', 'DESC');
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe(
      'SELECT * FROM posts ORDER BY posts.created_at DESC'
    );
    expect(bindings).toEqual([]);
  });
  it('should handle minus signs', () => {
    const query = new SelectBuilder('SELECT * FROM posts');
    query.orderBy('-posts.created_at');
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe(
      'SELECT * FROM posts ORDER BY posts.created_at DESC'
    );
    expect(bindings).toEqual([]);
  });
  it('should handle expressions', () => {
    const query = new SelectBuilder('SELECT * FROM posts');
    query.orderBy('COUNT(*)');
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe('SELECT * FROM posts ORDER BY COUNT(*)');
    expect(bindings).toEqual([]);
  });
  it('should handle expressions DESC', () => {
    const query = new SelectBuilder('SELECT * FROM posts');
    query.orderBy('COUNT(*) DESC');
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe('SELECT * FROM posts ORDER BY COUNT(*) DESC');
    expect(bindings).toEqual([]);
  });
  it('should handle NULLS LAST', () => {
    const query = new SelectBuilder('SELECT * FROM posts');
    query.orderBy('created_at DESC NULLS LAST');
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe(
      'SELECT * FROM posts ORDER BY created_at DESC NULLS LAST'
    );
    expect(bindings).toEqual([]);
  });
});
describe('LIMIT and OFFSET', () => {
  it('should add both', () => {
    const query = new SelectBuilder('SELECT * FROM posts');
    query.limit(2);
    query.offset(4);
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe('SELECT * FROM posts LIMIT 2 OFFSET 4');
    expect(bindings).toEqual([]);
  });
  it('should add both for mssql', () => {
    const query = new SelectBuilder('SELECT * FROM posts');
    query.limit(2);
    query.offset(4);
    const { sql, bindings } = query.compile({ engine: 'mssql' });
    expect(trim(sql)).toBe(
      'SELECT * FROM posts ORDER BY (SELECT NULL) OFFSET 4 ROWS FETCH NEXT 2 ROWS ONLY'
    );
    expect(bindings).toEqual([]);
  });
  it('should add only limit', () => {
    const query = new SelectBuilder('SELECT * FROM posts');
    query.limit(2);
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe('SELECT * FROM posts LIMIT 2');
    expect(bindings).toEqual([]);
  });
  it('should add only offset', () => {
    const query = new SelectBuilder('SELECT * FROM posts');
    query.offset(4);
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe(
      'SELECT * FROM posts LIMIT 18446744073709551615 OFFSET 4'
    );
    expect(bindings).toEqual([]);
  });
  it('should add only offset as string', () => {
    const query = new SelectBuilder('SELECT * FROM posts');
    query.offset('4');
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe(
      'SELECT * FROM posts LIMIT 18446744073709551615 OFFSET 4'
    );
    expect(bindings).toEqual([]);
  });
  it('should error on offset NaN', () => {
    const query = new SelectBuilder('SELECT * FROM posts');
    const tryer = () => query.offset(NaN);
    expect(tryer).toThrow();
  });
  it('should error on limit integer', () => {
    const query = new SelectBuilder('SELECT * FROM posts');
    const tryer = () => query.limit(3.5);
    expect(tryer).toThrow();
  });
  it('should error on limit strings that are not positive integers', () => {
    const query = new SelectBuilder('SELECT * FROM posts');
    for (const bad of ['abc', '0', '-1', '', ' ', '1.5', '010', '?']) {
      expect(() => query.limit(bad)).toThrow(
        `SelectBuilder: "limit(n)" must receive a positive integer (got "${bad}")`
      );
    }
    expect(query._limit).toBeUndefined();
  });
  it('should accept a limit string of digits with surrounding whitespace', () => {
    const query = new SelectBuilder('SELECT * FROM posts').limit(' 7 ');
    expect(trim(query.compile().sql)).toBe('SELECT * FROM posts LIMIT 7');
  });
  it('should say offset must be a non-negative integer', () => {
    const query = new SelectBuilder('SELECT * FROM posts');
    expect(() => query.offset(-1)).toThrow(
      'SelectBuilder: "offset(n)" must receive a non-negative integer (got "-1")'
    );
    expect(() => query.offset('abc')).toThrow(
      'SelectBuilder: "offset(n)" must receive a non-negative integer (got "abc")'
    );
    expect(() => query.offset(0)).not.toThrow();
    expect(() => query.offset('0')).not.toThrow();
  });
});
describe('page()', () => {
  it('should allow number', () => {
    const query = new SelectBuilder('SELECT * FROM posts');
    query.limit(10);
    query.page(3);
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe('SELECT * FROM posts LIMIT 10 OFFSET 20');
    expect(bindings).toEqual([]);
  });
  it('should allow string digits', () => {
    const query = new SelectBuilder('SELECT * FROM posts');
    query.limit('10');
    query.page('3');
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe('SELECT * FROM posts LIMIT 10 OFFSET 20');
    expect(bindings).toEqual([]);
  });
  it('should error on 0', () => {
    const query = new SelectBuilder('SELECT * FROM posts');
    const tryer = () => query.page(0);
    expect(tryer).toThrow();
  });
  it('should error on -1', () => {
    const query = new SelectBuilder('SELECT * FROM posts');
    const tryer = () => query.page(-1);
    expect(tryer).toThrow(
      'SelectBuilder: "page(n)" must receive a positive integer'
    );
  });
  it('should error on non-number', () => {
    const query = new SelectBuilder('SELECT * FROM posts');
    const tryer = () => query.page('foobar');
    expect(tryer).toThrow();
  });
});
describe('pagination by engine', () => {
  type Case = [string, (q: SelectBuilder) => void];
  const cases: Case[] = [
    ['limit only', q => q.limit(2)],
    ['offset only', q => q.offset(4)],
    ['limit and offset', q => q.limit(2).offset(4)],
    ['limit and page', q => q.limit(10).page(3)],
  ];
  const expected: Record<string, string[]> = {
    mysql: [
      'LIMIT 2',
      'LIMIT 18446744073709551615 OFFSET 4',
      'LIMIT 2 OFFSET 4',
      'LIMIT 10 OFFSET 20',
    ],
    pg: ['LIMIT 2', 'OFFSET 4', 'LIMIT 2 OFFSET 4', 'LIMIT 10 OFFSET 20'],
    oracle: [
      'FETCH NEXT 2 ROWS ONLY',
      'OFFSET 4 ROWS',
      'OFFSET 4 ROWS FETCH NEXT 2 ROWS ONLY',
      'OFFSET 20 ROWS FETCH NEXT 10 ROWS ONLY',
    ],
    mssql: [
      'ORDER BY (SELECT NULL) OFFSET 0 ROWS FETCH NEXT 2 ROWS ONLY',
      'ORDER BY (SELECT NULL) OFFSET 4 ROWS',
      'ORDER BY (SELECT NULL) OFFSET 4 ROWS FETCH NEXT 2 ROWS ONLY',
      'ORDER BY (SELECT NULL) OFFSET 20 ROWS FETCH NEXT 10 ROWS ONLY',
    ],
  };
  for (const engine of ['mysql', 'pg', 'oracle', 'mssql'] as const) {
    cases.forEach(([name, apply], i) => {
      it(`should handle ${name} for ${engine}`, () => {
        const query = new SelectBuilder('SELECT * FROM posts');
        apply(query);
        const { sql, bindings } = query.compile({ engine });
        expect(trim(sql)).toBe(`SELECT * FROM posts ${expected[engine][i]}`);
        expect(bindings).toEqual([]);
      });
    });
  }
  it('should emit nothing without limit/offset for any engine', () => {
    for (const engine of ['mysql', 'pg', 'oracle', 'mssql'] as const) {
      const query = new SelectBuilder('SELECT * FROM posts');
      expect(trim(query.compile({ engine }).sql)).toBe('SELECT * FROM posts');
    }
  });
  it('should treat offset 0 as no offset', () => {
    const query = new SelectBuilder('SELECT * FROM posts').offset(0).limit(5);
    expect(trim(query.compile({ engine: 'mysql' }).sql)).toBe(
      'SELECT * FROM posts LIMIT 5'
    );
    expect(trim(query.compile({ engine: 'oracle' }).sql)).toBe(
      'SELECT * FROM posts FETCH NEXT 5 ROWS ONLY'
    );
    expect(trim(query.compile({ engine: 'mssql' }).sql)).toBe(
      'SELECT * FROM posts ORDER BY (SELECT NULL) OFFSET 0 ROWS FETCH NEXT 5 ROWS ONLY'
    );
  });
  it('should use the existing ORDER BY for mssql', () => {
    const query = new SelectBuilder(
      'SELECT * FROM posts ORDER BY created_at DESC'
    );
    query.limit(2).offset(4);
    const { sql } = query.compile({ engine: 'mssql' });
    expect(trim(sql)).toBe(
      'SELECT * FROM posts ORDER BY created_at DESC OFFSET 4 ROWS FETCH NEXT 2 ROWS ONLY'
    );
    expect(sql.match(/ORDER BY/g)).toHaveLength(1);
  });
  it('should not add ORDER BY for mssql without pagination', () => {
    const query = new SelectBuilder('SELECT * FROM posts');
    const { sql } = query.compile({ engine: 'mssql' });
    expect(trim(sql)).toBe('SELECT * FROM posts');
  });
  it('should not add ORDER BY (SELECT NULL) for other engines', () => {
    for (const engine of ['mysql', 'pg', 'oracle'] as const) {
      const query = new SelectBuilder('SELECT * FROM posts').limit(2);
      expect(query.compile({ engine }).sql).not.toContain('ORDER BY');
    }
  });
  it('should omit pagination from compileCount for mssql', () => {
    const query = new SelectBuilder('SELECT * FROM posts').limit(2).offset(4);
    const { sql } = query.compileCount({ engine: 'mssql' });
    expect(trim(sql)).toBe('SELECT COUNT(*) AS found_rows FROM posts');
  });
});
describe('placeholders by engine', () => {
  const make = () => {
    const query = new SelectBuilder('SELECT * FROM users');
    query.where('org', 'ACME');
    query.where('group', 2);
    return query;
  };
  it('should use ? for mysql', () => {
    const { sql, bindings } = make().compile({ engine: 'mysql' });
    expect(trim(sql)).toBe('SELECT * FROM users WHERE org = ? AND group = ?');
    expect(bindings).toEqual(['ACME', 2]);
  });
  it('should use $n for pg', () => {
    const { sql } = make().compile({ engine: 'pg' });
    expect(trim(sql)).toBe('SELECT * FROM users WHERE org = $1 AND group = $2');
  });
  it('should use :n for oracle', () => {
    const { sql, bindings } = make().compile({ engine: 'oracle' });
    expect(trim(sql)).toBe('SELECT * FROM users WHERE org = :1 AND group = :2');
    expect(bindings).toEqual(['ACME', 2]);
  });
  it('should use @Pn for mssql', () => {
    const { sql, bindings } = make().compile({ engine: 'mssql' });
    expect(trim(sql)).toBe(
      'SELECT * FROM users WHERE org = @P1 AND group = @P2'
    );
    expect(bindings).toEqual(['ACME', 2]);
  });
  it('should honor bindingIndex for oracle and mssql', () => {
    expect(
      trim(make().compile({ engine: 'oracle', bindingIndex: 5 }).sql)
    ).toBe('SELECT * FROM users WHERE org = :5 AND group = :6');
    expect(trim(make().compile({ engine: 'mssql', bindingIndex: 5 }).sql)).toBe(
      'SELECT * FROM users WHERE org = @P5 AND group = @P6'
    );
  });
  it('should number oracle placeholders across compileUnion', () => {
    const { sql, bindings } = make().compileUnion(make(), { engine: 'oracle' });
    expect(trim(sql)).toBe(
      '(SELECT * FROM users WHERE org = :1 AND group = :2) UNION (SELECT * FROM users WHERE org = :3 AND group = :4)'
    );
    expect(bindings).toEqual(['ACME', 2, 'ACME', 2]);
  });
  it('should number mssql placeholders across compileUnion with bindingIndex', () => {
    const { sql, bindings } = make().compileUnion(make(), {
      engine: 'mssql',
      bindingIndex: 3,
    });
    expect(trim(sql)).toBe(
      '(SELECT * FROM users WHERE org = @P3 AND group = @P4) UNION (SELECT * FROM users WHERE org = @P5 AND group = @P6)'
    );
    expect(bindings).toEqual(['ACME', 2, 'ACME', 2]);
  });
  it('should number oracle placeholders across compileUnion with bindingIndex', () => {
    const { sql } = make().compileUnion(make(), {
      engine: 'oracle',
      bindingIndex: 2,
    });
    expect(trim(sql)).toBe(
      '(SELECT * FROM users WHERE org = :2 AND group = :3) UNION (SELECT * FROM users WHERE org = :4 AND group = :5)'
    );
  });
  it('should honor bindingIndex in compileCount for oracle and mssql', () => {
    expect(
      trim(make().compileCount({ engine: 'oracle', bindingIndex: 4 }).sql)
    ).toBe(
      'SELECT COUNT(*) AS found_rows FROM users WHERE org = :4 AND group = :5'
    );
    expect(
      trim(make().compileCount({ engine: 'mssql', bindingIndex: 4 }).sql)
    ).toBe(
      'SELECT COUNT(*) AS found_rows FROM users WHERE org = @P4 AND group = @P5'
    );
  });
});
describe('compileCount()', () => {
  it('should handle a simple query', () => {
    const query = new SelectBuilder('SELECT * FROM posts');
    const { sql, bindings } = query.compileCount();
    expect(trim(sql)).toBe('SELECT COUNT(*) AS found_rows FROM posts');
    expect(bindings).toEqual([]);
  });
  it('should handle a distinct', () => {
    const query = new SelectBuilder('SELECT * FROM posts');
    const { sql, bindings } = query.compileCount({
      countExpr: 'DISTINCT group_id',
      engine: 'mysql',
    });
    expect(trim(sql)).toBe(
      'SELECT COUNT(DISTINCT group_id) AS found_rows FROM posts'
    );
    expect(bindings).toEqual([]);
  });
  it('should work with WHERE', () => {
    const query = new SelectBuilder('SELECT * FROM posts');
    query.where('group_id', 123);
    const { sql, bindings } = query.compileCount();
    expect(trim(sql)).toBe(
      'SELECT COUNT(*) AS found_rows FROM posts WHERE group_id = ?'
    );
    expect(bindings).toEqual([123]);
  });
  it('should work with HAVING', () => {
    const origSql =
      'SELECT category, COUNT(*) FROM posts GROUP BY category HAVING COUNT(*) > 1';
    const query = new SelectBuilder(origSql);
    const { sql, bindings } = query.compileCount();
    expect(trim(sql)).toBe(
      `SELECT COUNT(*) AS found_rows FROM ( ${origSql} ) AS subquery_results`
    );
    expect(bindings).toEqual([]);
  });
  it('should count groups for GROUP BY without HAVING', () => {
    const origSql = 'SELECT category, COUNT(*) FROM posts GROUP BY category';
    const query = new SelectBuilder(origSql);
    const { sql, bindings } = query.compileCount();
    expect(trim(sql)).toBe(
      `SELECT COUNT(*) AS found_rows FROM ( ${origSql} ) AS subquery_results`
    );
    expect(bindings).toEqual([]);
  });
  it('should keep GROUP BY intact in getFoundRowsQuery()', () => {
    const query = new SelectBuilder(
      'SELECT category, COUNT(*) FROM posts GROUP BY category ORDER BY category LIMIT 5'
    );
    const found = query.getFoundRowsQuery();
    expect(found._columns).toEqual(['category', 'COUNT(*)']);
    expect(found._groupBys).toEqual(['category']);
    expect(found._orderBys).toEqual([]);
    expect(found._limit).toBeUndefined();
  });
  it('should number pg bindings for GROUP BY with WHERE', () => {
    const query = new SelectBuilder(
      'SELECT category, COUNT(*) FROM posts GROUP BY category'
    );
    query.where('group_id', 123);
    query.where('status', 'published');
    query.orderBy('category');
    query.limit(10).offset(20);
    const { sql, bindings } = query.compileCount({
      engine: 'pg',
      bindingIndex: 3,
    });
    expect(trim(sql)).toBe(
      'SELECT COUNT(*) AS found_rows FROM ( SELECT category, COUNT(*) FROM posts WHERE group_id = $3 AND status = $4 GROUP BY category ) AS subquery_results'
    );
    expect(bindings).toEqual([123, 'published']);
  });
  it('should wrap queries with a DISTINCT option', () => {
    const query = new SelectBuilder('SELECT city FROM t');
    query.option('DISTINCT');
    const { sql } = query.compileCount();
    expect(trim(sql)).toBe(
      'SELECT COUNT(*) AS found_rows FROM ( SELECT DISTINCT city FROM t ) AS subquery_results'
    );
  });
  it('should detect DISTINCT in parsed SQL case-insensitively', () => {
    const query = new SelectBuilder('select distinct city from t');
    expect(trim(query.compileCount().sql)).toBe(
      'SELECT COUNT(*) AS found_rows FROM ( SELECT distinct city FROM t ) AS subquery_results'
    );
  });
  it('should not treat a column named like distinct_x as DISTINCT', () => {
    const query = new SelectBuilder('SELECT distinct_count FROM t');
    expect(trim(query.compileCount().sql)).toBe(
      'SELECT COUNT(*) AS found_rows FROM t'
    );
  });
  it('should not treat non-DISTINCT options as DISTINCT', () => {
    const query = new SelectBuilder('SELECT a FROM t');
    query.option('SQL_CALC_FOUND_ROWS');
    query.option('TOP 10');
    query.option('INDISTINCTIVE');
    const { sql } = query.compileCount();
    expect(trim(sql)).toBe('SELECT COUNT(*) AS found_rows FROM t');
  });
  it('should omit ORDER BY from the HAVING subquery', () => {
    const query = new SelectBuilder(
      'SELECT category, COUNT(*) FROM posts GROUP BY category HAVING COUNT(*) > 1 ORDER BY category DESC'
    );
    const { sql } = query.compileCount();
    expect(sql).not.toContain('ORDER BY');
    expect(trim(sql)).toBe(
      'SELECT COUNT(*) AS found_rows FROM ( SELECT category, COUNT(*) FROM posts GROUP BY category HAVING COUNT(*) > 1 ) AS subquery_results'
    );
  });
  it('should drop SQL_CALC_FOUND_ROWS and TOP n from the count subquery', () => {
    const query = new SelectBuilder(
      'SELECT category, COUNT(*) FROM posts GROUP BY category'
    );
    query.option('SQL_CALC_FOUND_ROWS');
    query.option('TOP 10');
    expect(query.getFoundRowsQuery()._options).toEqual([]);
    expect(trim(query.compileCount().sql)).toBe(
      'SELECT COUNT(*) AS found_rows FROM ( SELECT category, COUNT(*) FROM posts GROUP BY category ) AS subquery_results'
    );
    // the original query keeps its options
    expect(query._options).toEqual(['SQL_CALC_FOUND_ROWS', 'TOP 10']);
  });
  it('should keep only DISTINCT-type options in the count subquery', () => {
    const query = new SelectBuilder('SELECT city FROM t');
    query.option('SQL_CALC_FOUND_ROWS');
    query.option('DISTINCT');
    query.option('TOP 5');
    expect(query.getFoundRowsQuery()._options).toEqual(['DISTINCT']);
    expect(trim(query.compileCount().sql)).toBe(
      'SELECT COUNT(*) AS found_rows FROM ( SELECT DISTINCT city FROM t ) AS subquery_results'
    );
  });
  it('should treat DISTINCTROW like DISTINCT', () => {
    const viaOption = new SelectBuilder('SELECT city FROM t').option(
      'DISTINCTROW'
    );
    viaOption.option('SQL_CALC_FOUND_ROWS');
    expect(trim(viaOption.compileCount().sql)).toBe(
      'SELECT COUNT(*) AS found_rows FROM ( SELECT DISTINCTROW city FROM t ) AS subquery_results'
    );
    const viaColumn = new SelectBuilder('SELECT a FROM t');
    viaColumn._columns = ['DISTINCTROW city'];
    expect(trim(viaColumn.compileCount().sql)).toBe(
      'SELECT COUNT(*) AS found_rows FROM ( SELECT DISTINCTROW city FROM t ) AS subquery_results'
    );
  });
  it('should not add ORDER BY (SELECT NULL) to mssql count subqueries', () => {
    const query = new SelectBuilder(
      'SELECT category, COUNT(*) FROM posts GROUP BY category HAVING COUNT(*) > 1'
    );
    query.limit(10).page(3);
    const { sql } = query.compileCount({ engine: 'mssql' });
    expect(sql).not.toContain('ORDER BY');
    expect(sql).not.toContain('OFFSET');
    expect(sql).not.toContain('FETCH');
  });
});

describe('compileUnion()', () => {
  it('should continue pg binding numbers into the second query', () => {
    const query1 = new SelectBuilder(
      'SELECT first, last, email FROM users WHERE org = :org AND group = :group',
      { org: 'ACME', group: 2 }
    );
    const query2 = new SelectBuilder(
      'SELECT first, last, email FROM contacts WHERE org = :org AND group = :group',
      { org: 'ACME', group: 2 }
    );
    const { sql, bindings } = query1.compileUnion(query2, { engine: 'pg' });
    expect(trim(sql)).toBe(
      `(SELECT first, last, email FROM users WHERE org = $1 AND group = $2) UNION (SELECT first, last, email FROM contacts WHERE org = $3 AND group = $4)`
    );
    expect(bindings).toEqual(['ACME', 2, 'ACME', 2]);
  });
});
describe('reset()', () => {
  it('should reset all', () => {
    const query = new SelectBuilder('SELECT id FROM a');
    query.reset();
    query.from('b');
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe('SELECT * FROM b');
    expect(bindings).toEqual([]);
  });
  it('should reset single field', () => {
    const query = new SelectBuilder('SELECT id FROM a');
    query.reset('table');
    query.from('b');
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe('SELECT id FROM b');
    expect(bindings).toEqual([]);
  });
  it('should reset multiple fields', () => {
    const query = new SelectBuilder('SELECT id FROM a');
    query.reset(['table', 'column']);
    query.from('b');
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe('SELECT * FROM b');
    expect(bindings).toEqual([]);
  });
  describe('each field name', () => {
    // every FieldName (singular and plural), the token its clause produces,
    // and the property group it belongs to; typed as a Record so that adding
    // a FieldName without a case here is a type error
    const cases: Record<
      FieldName,
      { token: string; group: string; withPage?: boolean }
    > = {
      option: { token: 'DISTINCT', group: 'options' },
      options: { token: 'DISTINCT', group: 'options' },
      select: { token: 'u.name', group: 'columns' },
      column: { token: 'u.name', group: 'columns' },
      columns: { token: 'u.name', group: 'columns' },
      table: { token: 'users u', group: 'tables' },
      tables: { token: 'users u', group: 'tables' },
      join: { token: 'orgs o', group: 'joins' },
      joins: { token: 'orgs o', group: 'joins' },
      where: { token: 'WHERE', group: 'wheres' },
      wheres: { token: 'WHERE', group: 'wheres' },
      having: { token: 'HAVING', group: 'havings' },
      havings: { token: 'HAVING', group: 'havings' },
      groupBy: { token: 'GROUP BY', group: 'groupBys' },
      groupBys: { token: 'GROUP BY', group: 'groupBys' },
      orderBy: { token: 'ORDER BY', group: 'orderBys' },
      orderBys: { token: 'ORDER BY', group: 'orderBys' },
      limit: { token: 'LIMIT 10', group: 'limit' },
      // page overrides offset, so test offset without a page
      offset: { token: 'OFFSET 5', group: 'offset', withPage: false },
      page: { token: 'OFFSET 20', group: 'page' },
    };
    const paginationGroups = ['limit', 'offset', 'page'];
    const build = (withPage: boolean) => {
      const query = new SelectBuilder()
        .option('DISTINCT')
        .columns(['u.id', 'u.name'])
        .from('users u')
        .join('orgs o ON o.id = u.org_id')
        .where('u.status', 'active')
        .groupBy('u.org_id')
        .having('COUNT(*) > 1')
        .orderBy('u.created_at')
        .limit(10)
        .offset(5);
      return withPage ? query.page(3) : query;
    };
    for (const [field, { token, group, withPage = true }] of Object.entries(
      cases
    )) {
      it(`should remove the clause for "${field}"`, () => {
        const query = build(withPage);
        const before = trim(query.compile({ engine: 'pg' }).sql);
        expect(before).toContain(token);
        query.reset(field as FieldName);
        const { sql, bindings } = query.compile({ engine: 'pg' });
        const after = trim(sql);
        expect(after).not.toContain(token);
        // other non-pagination clauses are untouched
        for (const other of Object.values(cases)) {
          if (
            other.group !== group &&
            !paginationGroups.includes(other.group)
          ) {
            expect(after).toContain(other.token);
          }
        }
        expect(bindings).toEqual(group === 'wheres' ? [] : ['active']);
      });
    }
  });
  it('should throw on unknown field names', () => {
    const query = new SelectBuilder('SELECT id FROM a WHERE b = 1');
    for (const bad of ['orWhere', 'wherez', 'bindings', 'toString', '']) {
      expect(() => query.reset(bad as FieldName)).toThrow(
        `SelectBuilder.reset(): unknown field ${JSON.stringify(bad)}`
      );
    }
    // array form validates every name before resetting anything
    expect(() => query.reset(['where', 'nope' as FieldName])).toThrow(
      'unknown field "nope"'
    );
    expect(trim(query.compile().sql)).toBe('SELECT id FROM a WHERE b = 1');
    expect(query).not.toHaveProperty('_wherez');
    expect(query).not.toHaveProperty('_where');
  });
});

describe('join()', () => {
  it('should allow generic join', () => {
    const query = new SelectBuilder();
    query.table('users u');
    query.join('avatars a ON a.user_id = u.id');
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe(
      'SELECT * FROM users u JOIN avatars a ON a.user_id = u.id'
    );
    expect(bindings).toEqual([]);
  });
  it('should allow join with bindings', () => {
    const query = new SelectBuilder();
    query.table('users u');
    query.leftJoin('avatars a ON a.user_id = u.id AND a.size = ?', [128]);
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe(
      'SELECT * FROM users u LEFT JOIN avatars a ON a.user_id = u.id AND a.size = ?'
    );
    expect(bindings).toEqual([128]);
  });
  it("should not mutate the caller's bindings array", () => {
    const query = new SelectBuilder();
    query.table('users u');
    const values = [128, 'png'];
    query.join(
      'avatars a ON a.user_id = u.id AND a.size = ? AND a.ext = ?',
      values
    );
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe(
      'SELECT * FROM users u JOIN avatars a ON a.user_id = u.id AND a.size = ? AND a.ext = ?'
    );
    expect(bindings).toEqual([128, 'png']);
    expect(values).toEqual([128, 'png']);
  });
  it('should allow unjoin', () => {
    const query = new SelectBuilder();
    query.table('users u');
    query.join('avatars a ON a.user_id = u.id');
    query.join('permissions p ON p.user_id = u.id');
    query.unjoin('permissions p');
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe(
      'SELECT * FROM users u JOIN avatars a ON a.user_id = u.id'
    );
    expect(bindings).toEqual([]);
  });
  it('should allow unjoin with array', () => {
    const query = new SelectBuilder();
    query.table('users u');
    query.join('avatars a ON a.user_id = u.id');
    query.join('permissions p ON p.user_id = u.id');
    query.unjoin(['avatars', 'permissions p']);
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe('SELECT * FROM users u');
    expect(bindings).toEqual([]);
  });
  it('should unjoin any join type but only whole table names', () => {
    const query = new SelectBuilder('SELECT * FROM users u');
    query.leftOuterJoin('avatars a ON a.user_id = u.id');
    query.join('avatars_big b ON b.user_id = u.id');
    query.unjoin('avatars');
    expect(query._joins).toEqual(['JOIN avatars_big b ON b.user_id = u.id']);
  });
  it('should treat regex metacharacters in unjoin() names literally', () => {
    const query = new SelectBuilder('SELECT * FROM users u');
    query.join('schemaXtbl x ON x.id = u.id');
    query.join('schema.tbl s ON s.id = u.id');
    query.unjoin('schema.tbl');
    expect(query._joins).toEqual(['JOIN schemaXtbl x ON x.id = u.id']);
  });
  it('should unjoin names that end in a non-word character', () => {
    const query = new SelectBuilder('SELECT * FROM users u');
    query.join('[dbo].[x] x ON x.id = u.id');
    query.join('[dbo].[xy] y ON y.id = u.id');
    query.join('"Media" m ON m.id = u.id');
    expect(() => query.unjoin('[dbo].[x]')).not.toThrow();
    query.unjoin('"Media"');
    expect(query._joins).toEqual(['JOIN [dbo].[xy] y ON y.id = u.id']);
  });
  it('should match JOIN keywords case-insensitively in unjoin()', () => {
    const query = new SelectBuilder('SELECT * FROM users u');
    query._joins.push('left join avatars a ON a.user_id = u.id');
    query._joins.push('Join permissions p ON p.user_id = u.id');
    query.unjoin(['avatars', 'permissions  p']);
    expect(query._joins).toEqual([]);
  });
  it('should not unjoin based on a JOIN inside the ON clause', () => {
    const query = new SelectBuilder('SELECT * FROM users u');
    query.join(
      'avatars a ON a.id IN (SELECT id FROM images i JOIN sizes s ON s.id = i.size_id)'
    );
    query.unjoin('sizes');
    expect(query._joins).toHaveLength(1);
  });
});
describe('options()', () => {
  it('should add SQL_CALC_FOUND_ROWS', () => {
    const query = new SelectBuilder();
    query.table('users');
    query.columns(['a', 'b']);
    query.limit(10);
    query.option('SQL_CALC_FOUND_ROWS');
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe(
      'SELECT SQL_CALC_FOUND_ROWS a, b FROM users LIMIT 10'
    );
    expect(bindings).toEqual([]);
  });
});
describe('columns()', () => {
  it('should allow 2', () => {
    const query = new SelectBuilder();
    query.table('users');
    query.columns(['a', 'b']);
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe('SELECT a, b FROM users');
    expect(bindings).toEqual([]);
  });
  it('should have alias select()', () => {
    const query = new SelectBuilder();
    query.table('users');
    query.select(['a', 'b']);
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe('SELECT a, b FROM users');
    expect(bindings).toEqual([]);
  });
});
describe('tables()', () => {
  it('should allow 2', () => {
    const query = new SelectBuilder();
    query.tables(['users', 'groups']);
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe('SELECT * FROM users, groups');
    expect(bindings).toEqual([]);
  });
});
describe('setDefaultEngine()', () => {
  it('should set ok', () => {
    SelectBuilder.setDefaultEngine('pg');
    const query = new SelectBuilder('SELECT * FROM users');
    query.where('id', 123);
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe('SELECT * FROM users WHERE id = $1');
    expect(bindings).toEqual([123]);

    // and set engine to something else then compile again
    SelectBuilder.setDefaultEngine('oracle');
    const compiled = query.compile();
    expect(trim(compiled.sql)).toBe('SELECT * FROM users WHERE id = :1');
    expect(compiled.bindings).toEqual([123]);

    // and back to mysql
    SelectBuilder.setDefaultEngine('mysql');
    const mysql = query.compile();
    expect(trim(mysql.sql)).toBe('SELECT * FROM users WHERE id = ?');
  });
});
describe('constructor named bindings', () => {
  const castSql =
    'SELECT ROUND(AVG(x)::numeric, 1) AS avg, y::date AS d FROM t';
  const castPg =
    'SELECT ROUND(AVG(x)::numeric, 1) AS avg, y::date AS d FROM t WHERE t.uuid = $1';
  for (const [label, args] of [
    ['no bindings argument', []],
    ['empty bindings', [{}]],
    ['unrelated keys', [{ foo: 1, bar: 2 }]],
  ] as const) {
    it(`should leave ::casts alone with ${label}`, () => {
      const q = new SelectBuilder(castSql, ...(args as readonly [any?]));
      q.where('t.uuid', 'U');
      const { sql, bindings } = q.compile({ engine: 'pg' });
      expect(trim(sql)).toBe(castPg);
      expect(bindings).toEqual(['U']);
    });
  }
  it('should bind :uuid for pg and mysql', () => {
    const uuid = 'abc';
    const q = new SelectBuilder('SELECT * FROM t WHERE t.uuid = :uuid', {
      uuid,
    });
    const pg = q.compile({ engine: 'pg' });
    expect(trim(pg.sql)).toBe('SELECT * FROM t WHERE t.uuid = $1');
    expect(pg.bindings).toEqual([uuid]);
    const my = q.compile({ engine: 'mysql' });
    expect(trim(my.sql)).toBe('SELECT * FROM t WHERE t.uuid = ?');
    expect(my.bindings).toEqual([uuid]);
  });
  it('should not match ::date but bind :date', () => {
    const d = new Date(0);
    const q = new SelectBuilder(
      'SELECT x::date AS a FROM t WHERE t.created > :date',
      { date: d }
    );
    const { sql, bindings } = q.compile({ engine: 'pg' });
    expect(trim(sql)).toBe('SELECT x::date AS a FROM t WHERE t.created > $1');
    expect(bindings).toEqual([d]);
  });
  it('should bind exact :user and :userId tokens', () => {
    const q = new SelectBuilder(
      'SELECT * FROM t WHERE a = :user AND b = :userId',
      { user: 'u', userId: 7 }
    );
    const { sql, bindings } = q.compile({ engine: 'pg' });
    expect(trim(sql)).toBe('SELECT * FROM t WHERE a = $1 AND b = $2');
    expect(bindings).toEqual(['u', 7]);
  });
  it('should not match a longer token that merely starts with the key', () => {
    const q = new SelectBuilder('SELECT * FROM t WHERE a = :idempotencyKey', {
      id: 1,
    });
    const { sql, bindings } = q.compile({ engine: 'pg' });
    expect(trim(sql)).toBe('SELECT * FROM t WHERE a = :idempotencyKey');
    expect(bindings).toEqual([]);
  });
  it('should escape regex metacharacters in keys', () => {
    const make = () =>
      new SelectBuilder('SELECT * FROM t WHERE a = :axb AND b = :a.b', {
        'a.b': 1,
      });
    expect(make).not.toThrow();
    const { sql, bindings } = make().compile({ engine: 'pg' });
    expect(trim(sql)).toBe('SELECT * FROM t WHERE a = :axb AND b = $1');
    expect(bindings).toEqual([1]);
  });
  it('should leave time literals and JSON paths alone', () => {
    const base = `SELECT '12:30' AS t, data->'$.a:b' AS j FROM t`;
    for (const bindings of [undefined, {}, { foo: 1 }]) {
      const q = new SelectBuilder(base, bindings);
      const out = q.compile({ engine: 'pg' });
      expect(trim(out.sql)).toBe(base);
      expect(out.bindings).toEqual([]);
    }
  });
  it('should not use the constructor regex for ? placeholders', () => {
    const q = new SelectBuilder('SELECT x::numeric FROM t');
    q.where('a', 1);
    q.join('u ON u.id = t.id AND u.k = ?', [5]);
    q.having('COUNT(*) > ?', 2);
    const { sql, bindings } = q.compile({ engine: 'pg' });
    expect(sql).toContain('x::numeric');
    expect(trim(sql)).toBe(
      'SELECT x::numeric FROM t JOIN u ON u.id = t.id AND u.k = $1 WHERE a = $2 HAVING COUNT(*) > $3'
    );
    expect(bindings).toEqual([5, 1, 2]);
  });
});
describe('_conditions() validation', () => {
  // 1. LIKE-infix with an array always uses the column/operator form
  it('should treat "col LIKE %?%" + 1-item array as a LIKE, not raw placeholders', () => {
    const query = new SelectBuilder('SELECT * FROM users');
    query.where('name LIKE %?%', ['joe']);
    query.where('code LIKE ?%', ['a']);
    query.where('tag NOT ILIKE %?', ['x']);
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe(
      'SELECT * FROM users WHERE (name LIKE ?) AND (code LIKE ?) AND (tag NOT ILIKE ?)'
    );
    expect(bindings).toEqual(['%joe%', 'a%', '%x']);
  });
  it('should treat "col LIKE %?%" + 2-item array as ORed LIKEs', () => {
    const query = new SelectBuilder('SELECT * FROM users');
    query.where('name LIKE %?%', ['joe', 'bob']);
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe(
      'SELECT * FROM users WHERE (name LIKE ? OR name LIKE ?)'
    );
    expect(bindings).toEqual(['%joe%', '%bob%']);
  });
  it('should treat "col LIKE ?" + array as ORed LIKEs', () => {
    const query = new SelectBuilder('SELECT * FROM users');
    query.where('name LIKE ?', ['joe']);
    query.where({ 'nick like ?': ['a', 'b'] });
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe(
      'SELECT * FROM users WHERE (name LIKE ?) AND (nick LIKE ? OR nick LIKE ?)'
    );
    expect(bindings).toEqual(['joe', 'a', 'b']);
  });
  it('should throw when "?" count does not match the array length', () => {
    const query = new SelectBuilder('SELECT * FROM users');
    expect(() => query.where('a = ? OR b = ?', [1])).toThrow(
      'SelectBuilder: "a = ? OR b = ?" has 2 "?" placeholder(s) but 1 value(s) were given'
    );
    expect(() => query.where('a = ?', [1, 2])).toThrow(/^SelectBuilder:/);
    expect(() => query.where('a = ? AND b = ?', [])).toThrow(/^SelectBuilder:/);
    expect(() => query.orWhere([['a = ? OR b = ?', [1]]])).toThrow(
      /^SelectBuilder:/
    );
    expect(() => query.having('SUM(x) > ? AND SUM(y) > ?', [1])).toThrow(
      /^SelectBuilder:/
    );
    expect(trim(query.compile().sql)).toBe('SELECT * FROM users');
  });
  // 2. array values only with equality operators
  it('should throw for an array value with a non-equality operator', () => {
    const query = new SelectBuilder('SELECT * FROM users');
    expect(() => query.where('price', '>', [1, 2])).toThrow(
      'SelectBuilder: operator ">" for "price" cannot take an array value; use =, IN, !=, <> or NOT IN'
    );
    expect(() => query.where('price <', [1, 2])).toThrow(/^SelectBuilder:/);
    expect(() => query.where({ 'price >=': [1] })).toThrow(/^SelectBuilder:/);
    expect(() => query.where('price', 'IS', [1])).toThrow(/^SelectBuilder:/);
    expect(() => query.where('price', '>', [])).toThrow(/^SelectBuilder:/);
  });
  it('should map =/IN and !=/<>/NOT IN (any case) for array values', () => {
    const query = new SelectBuilder('SELECT * FROM users');
    query.where('a', 'in', [1]);
    query.where('b', '=', [2]);
    query.where('c', 'not in', [3]);
    query.where('d', '<>', [4]);
    query.where('e !=', [5]);
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe(
      'SELECT * FROM users WHERE a IN(?) AND b IN(?) AND c NOT IN(?) AND d NOT IN(?) AND e NOT IN(?)'
    );
    expect(bindings).toEqual([1, 2, 3, 4, 5]);
  });
  // 3. null only with equality/IS operators
  it('should throw for null with a non-equality operator', () => {
    const query = new SelectBuilder('SELECT * FROM users');
    expect(() => query.where('price', '>', null)).toThrow(
      'SelectBuilder: cannot compare "price" to null with operator ">"; use =, IS, !=, <>, NOT or IS NOT'
    );
    expect(() => query.where('price >', null)).toThrow(/^SelectBuilder:/);
    expect(() => query.where('price', 'IN', null)).toThrow(/^SelectBuilder:/);
    expect(() => query.where({ 'price <=': null })).toThrow(/^SelectBuilder:/);
  });
  it('should map =/IS and !=/<>/IS NOT for null values', () => {
    const query = new SelectBuilder('SELECT * FROM users');
    query.where('a', 'is', null);
    query.where('b', '<>', null);
    query.where('c IS NOT', null);
    query.where({ 'd !=': null });
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe(
      'SELECT * FROM users WHERE a IS NULL AND b IS NOT NULL AND c IS NOT NULL AND d IS NOT NULL'
    );
    expect(bindings).toEqual([]);
  });
  // 4. undefined values throw
  it('should throw for undefined scalar values', () => {
    const query = new SelectBuilder('SELECT * FROM users');
    expect(() => query.where('a', undefined)).toThrow(
      'SelectBuilder: the value for "a =" is undefined; use null to compare against NULL'
    );
    expect(() => query.where('a', '>', undefined)).toThrow(/^SelectBuilder:/);
    expect(() => query.where({ a: undefined })).toThrow(/^SelectBuilder:/);
    expect(() => query.orWhere({ a: 1, b: undefined })).toThrow(
      /^SelectBuilder:/
    );
    expect(() => query.having('SUM(x) >', undefined)).toThrow(
      /^SelectBuilder:/
    );
    expect(trim(query.compile().sql)).toBe('SELECT * FROM users');
  });
  it('should throw for undefined elements in arrays', () => {
    const query = new SelectBuilder('SELECT * FROM users');
    expect(() => query.where('a', [1, undefined])).toThrow(
      'SelectBuilder: IN value 1 for "a" is undefined; use null for NULL'
    );
    expect(() => query.where('a', 'NOT IN', [undefined])).toThrow(
      /^SelectBuilder:/
    );
    expect(() => query.where('a = ?', [undefined])).toThrow(/^SelectBuilder:/);
    expect(() => query.where('a', 'LIKE', ['x', undefined])).toThrow(
      /^SelectBuilder:/
    );
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe('SELECT * FROM users');
    expect(bindings).toEqual([]);
  });
  // 5. empty LIKE arrays are omitted
  it('should omit LIKE conditions with an empty array', () => {
    const query = new SelectBuilder('SELECT * FROM users');
    query.where('name', 'LIKE', []);
    query.where('name LIKE %?%', []);
    query.where({ 'name NOT ILIKE ?%': [] });
    query.where('id', 1);
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe('SELECT * FROM users WHERE id = ?');
    expect(bindings).toEqual([1]);
  });
  it('should omit empty LIKE arrays inside orWhere()', () => {
    const query = new SelectBuilder('SELECT * FROM users');
    query.orWhere([['name', 'LIKE', []]]);
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe('SELECT * FROM users');
    expect(bindings).toEqual([]);
  });
  // 6. scalar LIKE keeps falsy values; null throws
  it('should keep falsy non-null LIKE values', () => {
    const query = new SelectBuilder('SELECT * FROM users');
    query.where('code', 'LIKE ?%', 0);
    query.where('flag', 'LIKE', false);
    query.where('name', 'LIKE %?%', '');
    const { bindings } = query.compile();
    expect(bindings).toEqual(['0%', 'false', '%%']);
  });
  it('should throw for null LIKE values', () => {
    const query = new SelectBuilder('SELECT * FROM users');
    expect(() => query.where('code', 'LIKE ?%', null)).toThrow(
      'SelectBuilder: LIKE value for "code" must not be null; use where("code", null) to test for NULL'
    );
    expect(() => query.where('code NOT LIKE', null)).toThrow(/^SelectBuilder:/);
    expect(() => query.where('code', 'ILIKE', ['a', null])).toThrow(
      /^SelectBuilder:/
    );
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe('SELECT * FROM users');
    expect(bindings).toEqual([]);
  });
  // 7. BETWEEN requires a 2-item array
  it('should throw for BETWEEN without a 2-item array', () => {
    const query = new SelectBuilder('SELECT * FROM users');
    expect(() => query.where('name', 'BETWEEN', 'ab')).toThrow(
      'SelectBuilder: BETWEEN for "name" requires an array of exactly 2 values'
    );
    expect(() => query.where('age', 'BETWEEN', 5)).toThrow(/^SelectBuilder:/);
    expect(() => query.where('age', 'BETWEEN', [5])).toThrow(/^SelectBuilder:/);
    expect(() => query.where('age', 'NOT BETWEEN', [1, 2, 3])).toThrow(
      /^SelectBuilder:/
    );
    expect(() => query.where({ 'age BETWEEN': 'xy' })).toThrow(
      /^SelectBuilder:/
    );
  });
  it('should throw for BETWEEN with a null or undefined bound', () => {
    const query = new SelectBuilder('SELECT * FROM users');
    expect(() => query.where('age', 'BETWEEN', [null, 5])).toThrow(
      'SelectBuilder: BETWEEN for "age" received a null or undefined bound; use whereBetween() for an open-ended range'
    );
    expect(() => query.where('age', 'BETWEEN', [5, undefined])).toThrow(
      /^SelectBuilder:/
    );
  });
  it('should keep whereBetween() working with null halves', () => {
    const query = new SelectBuilder('SELECT * FROM users');
    query.whereBetween('a', [1, 2]);
    query.whereBetween('b', [null, 2]);
    query.whereBetween('c', [1, null]);
    query.whereBetween('d', [null, null]);
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe(
      'SELECT * FROM users WHERE a BETWEEN ? AND ? AND b <= ? AND c >= ?'
    );
    expect(bindings).toEqual([1, 2, 2, 1]);
  });
  // 8. locale-independent operator casing
  it('should not use locale-sensitive upper-casing for operators', () => {
    // simulate a Turkish locale, where "i".toLocaleUpperCase() is "İ"
    const spy = spyOn(String.prototype, 'toLocaleUpperCase').mockImplementation(
      function (this: string) {
        return this.replace(/i/g, 'İ').toUpperCase();
      }
    );
    try {
      const query = new SelectBuilder('SELECT * FROM users');
      query.where('a', 'in', [1, 2]);
      query.where('b', 'not in', [3]);
      query.where('c', 'like', 'x');
      query.where('d ilike %?%', 'y');
      query.where('e', 'is', null);
      const { sql, bindings } = query.compile();
      expect(trim(sql)).toBe(
        'SELECT * FROM users WHERE a IN(?, ?) AND b NOT IN(?) AND c LIKE ? AND d ILIKE ? AND e IS NULL'
      );
      expect(bindings).toEqual([1, 2, 3, 'x', '%y%']);
    } finally {
      spy.mockRestore();
    }
  });
  // 9. null / non-string / array criteria
  it('should throw a clear error for null or undefined criteria', () => {
    const query = new SelectBuilder('SELECT * FROM users');
    expect(() => query.where(null as any)).toThrow(
      'SelectBuilder: a where()/having() condition must be a string or a plain object (got null)'
    );
    expect(() => query.where(undefined as any)).toThrow(/^SelectBuilder:/);
    expect(() => query.having(null as any)).toThrow(/^SelectBuilder:/);
    expect(() => query.orWhere([null] as any)).toThrow(/^SelectBuilder:/);
    expect(() => query.orHaving([null] as any)).toThrow(/^SelectBuilder:/);
    expect(() => query.orWhere(null as any)).toThrow(
      'SelectBuilder: orWhere()/orHaving() expects an array or a plain object (got null)'
    );
    expect(trim(query.compile().sql)).toBe('SELECT * FROM users');
  });
  it('should throw for an array passed as a where() condition', () => {
    const query = new SelectBuilder('SELECT * FROM users');
    expect(() => query.where(['a', 1] as any)).toThrow(/^SelectBuilder:/);
  });
  it('should still ignore an empty object', () => {
    const query = new SelectBuilder('SELECT * FROM users');
    query.where({});
    query.orWhere({});
    expect(trim(query.compile().sql)).toBe('SELECT * FROM users');
  });
});
describe('join() binding validation', () => {
  it('should throw when there are fewer bindings than placeholders', () => {
    const query = new SelectBuilder('SELECT * FROM users u');
    expect(() =>
      query.join('posts p ON p.user_id = u.id AND p.a = ? AND p.b = ?', [1])
    ).toThrow(
      'SelectBuilder: JOIN "posts p ON p.user_id = u.id AND p.a = ? AND p.b = ?" has 2 "?" placeholder(s) but 1 binding(s) were given'
    );
  });
  it('should throw when there are more bindings than placeholders', () => {
    const query = new SelectBuilder('SELECT * FROM users u');
    expect(() =>
      query.leftJoin('posts p ON p.user_id = u.id AND p.a = ?', [1, 2])
    ).toThrow(/^SelectBuilder: LEFT JOIN/);
    expect(() => query.innerJoin('posts p ON p.user_id = u.id', [1])).toThrow(
      /^SelectBuilder: INNER JOIN/
    );
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe('SELECT * FROM users u');
    expect(bindings).toEqual([]);
  });
  it('should throw for undefined bindings and non-array bindings', () => {
    const query = new SelectBuilder('SELECT * FROM users u');
    expect(() =>
      query.join('posts p ON p.user_id = u.id AND p.a = ?', [undefined])
    ).toThrow(/^SelectBuilder:/);
    expect(() =>
      query.join('posts p ON p.user_id = u.id AND p.a = ?', 5 as any)
    ).toThrow(/^SelectBuilder:/);
  });
  it('should leave literal ? untouched when bindings are empty', () => {
    const query = new SelectBuilder('SELECT * FROM users u');
    query.join("tags t ON t.data ?| array['a','b']");
    query.leftJoin("flags f ON f.data ? 'x'", []);
    const { sql, bindings } = query.compile({ engine: 'pg' });
    expect(trim(sql)).toBe(
      "SELECT * FROM users u JOIN tags t ON t.data ?| array['a','b'] LEFT JOIN flags f ON f.data ? 'x'"
    );
    expect(bindings).toEqual([]);
  });
});
describe('2-argument ? placeholder with a single value', () => {
  it('should bind a scalar to the one ? placeholder', () => {
    const query = new SelectBuilder('SELECT * FROM t');
    query.where('a = ?', 5);
    query.where('LOWER(name) = ?', 'joe');
    query.where('SUBSTR(prefs, ?, 4) = role', 1);
    query.where('flag IS NOT ?', true);
    query.groupBy('a');
    query.having('COUNT(*) > ?', 2);
    const { sql, bindings } = query.compile({ engine: 'pg' });
    expect(trim(sql)).toBe(
      'SELECT * FROM t WHERE a = $1 AND LOWER(name) = $2 AND SUBSTR(prefs, $3, 4) = role AND flag IS NOT $4 GROUP BY a HAVING COUNT(*) > $5'
    );
    expect(bindings).toEqual([5, 'joe', 1, true, 2]);
  });
  it('should bind a scalar to a ? placeholder in object and orWhere() forms', () => {
    const query = new SelectBuilder('SELECT * FROM t');
    query.where({ 'a = ?': 1 });
    query.orWhere([
      ['b > ?', 2],
      ['c < ?', 3],
    ]);
    const { sql, bindings } = query.compile({ engine: 'pg' });
    expect(trim(sql)).toBe(
      'SELECT * FROM t WHERE a = $1 AND (b > $2 OR c < $3)'
    );
    expect(bindings).toEqual([1, 2, 3]);
  });
  it('should throw unless there is exactly one ? for a scalar value', () => {
    const query = new SelectBuilder('SELECT * FROM t');
    expect(() => query.where('a = ? OR b = ?', 1)).toThrow(
      'SelectBuilder: "a = ? OR b = ?" has 2 "?" placeholder(s) but 1 value was given; pass an array with one value per "?"'
    );
    expect(() => query.having('COUNT(*) > ?', undefined as any)).toThrow(
      /^SelectBuilder: the value for "COUNT\(\*\) > \?" is undefined/
    );
    expect(query.compile().bindings).toEqual([]);
  });
  it('should keep treating a trailing ?, ?| or ?& as a jsonb operator', () => {
    const query = new SelectBuilder('SELECT * FROM t');
    query.where('tags ?', 'x');
    query.where('tags ?|', '{a,b}');
    query.where('tags ?&', '{a,b}');
    query.where("data->'k' ?", 'y');
    const { sql, bindings } = query.compile({ engine: 'pg' });
    expect(trim(sql)).toBe(
      "SELECT * FROM t WHERE tags ? $1 AND tags ?| $2 AND tags ?& $3 AND data->'k' ? $4"
    );
    expect(bindings).toEqual(['x', '{a,b}', '{a,b}', 'y']);
  });
  it('should keep the LIKE infix forms with a scalar', () => {
    const query = new SelectBuilder('SELECT * FROM t');
    query.where('name LIKE ?%', 'jo');
    query.where('name LIKE %?%', 'jo');
    query.where('name LIKE ?', 'jo');
    query.where('name NOT ILIKE %?', 'jo');
    const { sql, bindings } = query.compile({ engine: 'pg' });
    expect(trim(sql)).toBe(
      'SELECT * FROM t WHERE name LIKE $1 AND name LIKE $2 AND name LIKE $3 AND name NOT ILIKE $4'
    );
    expect(bindings).toEqual(['jo%', '%jo%', 'jo', '%jo']);
  });
});
describe('empty conditions', () => {
  it('should ignore empty or whitespace-only where()/having() strings', () => {
    const query = new SelectBuilder('SELECT * FROM t');
    query.where('a', 1);
    query.where('');
    query.where('   ');
    query.where('b', 2);
    query.groupBy('a');
    query.having('');
    query.having(' \n ');
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe('SELECT * FROM t WHERE a = ? AND b = ? GROUP BY a');
    expect(bindings).toEqual([1, 2]);
  });
  it('should ignore empty strings inside orWhere()', () => {
    const query = new SelectBuilder('SELECT * FROM t');
    query.orWhere(['', '  ']);
    query.orWhere(['', ['a', 1]]);
    expect(trim(query.compile().sql)).toBe('SELECT * FROM t WHERE (a = ?)');
  });
  it('should throw for an empty column with a value', () => {
    const query = new SelectBuilder('SELECT * FROM t');
    expect(() => query.where('', 1)).toThrow(
      'SelectBuilder: a where()/having() condition with a value must have a non-empty column or expression'
    );
    expect(() => query.having(' ', '>', 1)).toThrow(/^SelectBuilder:/);
  });
});
