import SelectBuilder from './SelectBuilder';

const trim = s => s.replace(/\s+/g, ' ').trim();

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
    const { sql, bindings } = query.compile('pg');
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
});
describe('sortField()', () => {
  it('should handle simple columns', () => {
    const query = new SelectBuilder('SELECT * FROM posts');
    query.sortField('posts.created_at');
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe('SELECT * FROM posts ORDER BY posts.created_at');
    expect(bindings).toEqual([]);
  });
  it('should handle minus signs', () => {
    const query = new SelectBuilder('SELECT * FROM posts');
    query.sortField('-posts.created_at');
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe(
      'SELECT * FROM posts ORDER BY posts.created_at DESC'
    );
    expect(bindings).toEqual([]);
  });
  it('should handle mapping', () => {
    const query = new SelectBuilder('SELECT * FROM posts');
    query.sortField('created_at', {
      created_at: 'posts.created_timestamp',
    });
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe(
      'SELECT * FROM posts ORDER BY posts.created_timestamp'
    );
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
});
describe('LIMIT and OFFSET', () => {
  it('should add both', () => {
    const query = new SelectBuilder('SELECT * FROM posts');
    query.limit(2);
    query.offset(4);
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe('SELECT * FROM posts OFFSET 4 LIMIT 2');
    expect(bindings).toEqual([]);
  });
  it('should add both for mssql', () => {
    const query = new SelectBuilder('SELECT * FROM posts');
    query.limit(2);
    query.offset(4);
    const { sql, bindings } = query.compile('mssql');
    expect(trim(sql)).toBe(
      'SELECT * FROM posts OFFSET 4 ROWS FETCH NEXT 2 ROWS ONLY'
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
    expect(trim(sql)).toBe('SELECT * FROM posts OFFSET 4');
    expect(bindings).toEqual([]);
  });
  it('should add only offset as string', () => {
    const query = new SelectBuilder('SELECT * FROM posts');
    query.offset('4');
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe('SELECT * FROM posts OFFSET 4');
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
});
describe('page()', () => {
  it('should allow number', () => {
    const query = new SelectBuilder('SELECT * FROM posts');
    query.limit(10);
    query.page(3);
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe('SELECT * FROM posts OFFSET 20 LIMIT 10');
    expect(bindings).toEqual([]);
  });
  it('should allow string digits', () => {
    const query = new SelectBuilder('SELECT * FROM posts');
    query.limit('10');
    query.page('3');
    const { sql, bindings } = query.compile();
    expect(trim(sql)).toBe('SELECT * FROM posts OFFSET 20 LIMIT 10');
    expect(bindings).toEqual([]);
  });
  it('should error on 0', () => {
    const query = new SelectBuilder('SELECT * FROM posts');
    const tryer = () => query.page(0);
    expect(tryer).toThrow();
  });
  it('should error on -1', () => {
    const query = new SelectBuilder('SELECT * FROM posts');
    const tryer = () => query.page(0);
    expect(tryer).toThrow();
  });
  it('should error on non-number', () => {
    const query = new SelectBuilder('SELECT * FROM posts');
    const tryer = () => query.page('foobar');
    expect(tryer).toThrow();
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
    const { sql, bindings } = query.compileCount('DISTINCT group_id');
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
