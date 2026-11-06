import { describe, expect, it } from 'bun:test';
import SelectBuilder from '../SelectBuilder/SelectBuilder';

const trim = s => s.replace(/\s+/g, ' ').trim();

describe('column handler', () => {
  it('should recognize asterisk', () => {
    const query = new SelectBuilder('SELECT * FROM mytable');
    expect(query._columns).toEqual(['*']);
  });
});
describe('comment handler', () => {
  it('should strip single-line comments -- dashes', () => {
    const query = new SelectBuilder(
      `
  			SELECT
  			-- stuff
  			a,
  				-- more stuff
  			b -- and even more stuff
  			FROM mytable
  		`
    );
    expect(trim(query.compile().sql)).toBe('SELECT a, b FROM mytable');
  });
  it('should strip single-line comments #hash', () => {
    const query = new SelectBuilder(
      `
  			SELECT
  			#stuff
  			a,
  				# more stuff
  			b #and even more stuff
  			FROM mytable
  		`
    );
    expect(trim(query.compile().sql)).toBe('SELECT a, b FROM mytable');
  });
  it('should strip multi-line comments', () => {
    const query = new SelectBuilder(
      `
  			SELECT
  			/*
  				stuff
  			*/
  			a,
  				/* more stuff */ b
  			FROM mytable
  		`
    );
    expect(trim(query.compile().sql)).toBe('SELECT a, b FROM mytable');
  });
});
describe('subquery handler', () => {
  it('should handle column subqueries', () => {
    const normalized =
      'SELECT a, (SELECT * FROM tbl2) AS b FROM mytable WHERE mycol = 1';
    const query = new SelectBuilder(normalized);
    expect(trim(query.compile().sql)).toBe(normalized);
  });
  it('should handle column subqueries with SELECT EXISTS', () => {
    const normalized =
      'SELECT a, (SELECT EXISTS (SELECT * FROM tbl2)) AS b FROM mytable WHERE mycol = 1';
    const query = new SelectBuilder(normalized);
    expect(trim(query.compile().sql)).toBe(normalized);
  });
  it('should handle IF() column expressions', () => {
    const normalized =
      'SELECT a, IF(b > 0) AS is_gt_0, IF(b > 100) AS is_gt_100 FROM mytable WHERE mycol = 1';
    const query = new SelectBuilder(normalized);
    expect(trim(query.compile().sql)).toBe(normalized);
  });
  it('should handle IN() expressions in WHERE', () => {
    const normalized =
      'SELECT * FROM mytable WHERE mycol IN (SELECT id FROM othertable)';
    const query = new SelectBuilder(normalized);
    expect(trim(query.compile().sql)).toBe(normalized);
  });
  it('should handle IN() expressions in JOINs', () => {
    const normalized =
      'SELECT * FROM a INNER JOIN b ON b.id = a.b_id AND b.status IN (SELECT id FROM statuses) WHERE a.id > 10';
    const query = new SelectBuilder(normalized);
    expect(trim(query.compile().sql)).toBe(normalized);
  });
});
describe('table handler', () => {
  it('should parse single table', () => {
    const query = new SelectBuilder('SELECT * FROM a');
    expect(query._tables).toEqual(['a']);
  });
  it('should parse comma-separated tables', () => {
    const query = new SelectBuilder('SELECT * FROM a, b');
    expect(query._tables).toEqual(['a', 'b']);
  });
});
describe('column handler', () => {
  it('should parse single column', () => {
    const query = new SelectBuilder('SELECT a FROM b');
    expect(query._columns).toEqual(['a']);
  });
  it('should parse comma-separated columns', () => {
    const query = new SelectBuilder('SELECT a, b FROM c');
    expect(query._columns).toEqual(['a', 'b']);
  });
  it('should handle expressions with one comma', () => {
    const query = new SelectBuilder("SELECT a, CONCAT('b',b) FROM c");
    expect(query._columns).toEqual(['a', "CONCAT('b',b)"]);
  });
  it('should handle expressions with 2 commas', () => {
    const query = new SelectBuilder(
      "SELECT a, CONCAT(fname, ' ', lname) FROM users"
    );
    expect(query._columns).toEqual(['a', "CONCAT(fname, ' ', lname)"]);
  });
});
describe('option handler', () => {
  it('should save SQL_CALC_FOUND_ROWS as an option', () => {
    const query = new SelectBuilder('SELECT SQL_CALC_FOUND_ROWS * FROM a');
    expect(query._columns).toEqual(['*']);
    expect(query._options).toEqual(['SQL_CALC_FOUND_ROWS']);
  });
});
describe('JOIN handler', () => {
  const joins = [
    'JOIN',
    'INNER JOIN',
    'LEFT JOIN',
    'LEFT OUTER JOIN',
    'OUTER JOIN',
    'RIGHT JOIN',
    'RIGHT OUTER JOIN',
    'CROSS JOIN',
    'FULL JOIN',
    'FULL OUTER JOIN',
  ];
  joins.forEach(join => {
    it(`should handle ${join}`, () => {
      const sql = `SELECT * FROM a ${join} b ON b.id = a.b_id`;
      const query = new SelectBuilder(sql);
      expect(trim(query.compile().sql)).toBe(sql);
    });
  });
});
describe('conditions handler', () => {
  it('should parse WHERE 1 = 1', () => {
    const query = new SelectBuilder('SELECT * FROM mytable WHERE 1 = 1');
    expect(query._wheres).toEqual(['1 = 1']);
  });
  it("should parse WHERE '1'", () => {
    const query = new SelectBuilder("SELECT * FROM mytable WHERE '1'");
    expect(query._wheres).toEqual(["'1'"]);
  });
  it('should parse WHERE true', () => {
    const query = new SelectBuilder('SELECT * FROM mytable WHERE true');
    expect(query._wheres).toEqual(['true']);
  });
  it('should parse single WHERE', () => {
    const query = new SelectBuilder('SELECT * FROM mytable WHERE mycol = 1');
    expect(query._wheres).toEqual(['mycol = 1']);
  });
  it('should parse two WHERE clauses joined by AND', () => {
    const query = new SelectBuilder(
      'SELECT * FROM mytable WHERE mycol = 1 AND scheduled < NOW()'
    );
    expect(query._wheres).toEqual(['mycol = 1', 'scheduled < NOW()']);
  });
  it('should parse two WHERE clauses joined by OR', () => {
    const query = new SelectBuilder(
      'SELECT * FROM mytable WHERE mycol = 1 OR scheduled < NOW()'
    );
    expect(query._wheres).toEqual(['(mycol = 1 OR scheduled < NOW())']);
  });
  it('should parse OR then AND', () => {
    const query = new SelectBuilder(
      'SELECT * FROM mytable WHERE a = 1 OR b = 2 AND c = 3'
    );
    expect(query._wheres).toEqual(['(a = 1 OR b = 2)', 'c = 3']);
  });
  it('should parse OR then AND with parens', () => {
    const query = new SelectBuilder(
      'SELECT * FROM mytable WHERE (a = 1 OR b = 2) AND c = 3'
    );
    expect(query._wheres).toEqual(['(a = 1 OR b = 2)', 'c = 3']);
  });
  it('should parse AND then OR', () => {
    const query = new SelectBuilder(
      'SELECT * FROM mytable WHERE a = 1 AND b = 2 OR c = 3'
    );
    expect(query._wheres).toEqual(['a = 1', '(b = 2 OR c = 3)']);
  });
});
it('should parse GROUP BY and HAVING', () => {
  const query = new SelectBuilder(
    'SELECT name, COUNT(*) FROM mytable GROUP BY name HAVING COUNT(*) > 1'
  );
  expect(query._groupBys).toEqual(['name']);
  expect(query._havings).toEqual(['COUNT(*) > 1']);
});
it('should parse ORDER BY', () => {
  const query = new SelectBuilder('SELECT * FROM users ORDER BY id DESC');
  expect(query._orderBys).toEqual(['id DESC']);
});
describe('pagination', () => {
  it('should parse LIMIT with number', () => {
    const query = new SelectBuilder('SELECT * FROM mytable LIMIT 1');
    expect(query._limit).toBe(1);
  });
  it('should parse OFFSET with number', () => {
    const query = new SelectBuilder('SELECT * FROM mytable LIMIT 5 OFFSET 10');
    expect(query._offset).toBe(10);
  });
  it('should parse OFFSET, LIMIT with numbers', () => {
    const query = new SelectBuilder('SELECT * FROM mytable LIMIT 10, 5');
    expect(query._limit).toBe(5);
    expect(query._offset).toBe(10);
  });
  it('should parse OFFSET # ROWS', () => {
    const query = new SelectBuilder('SELECT * FROM mytable OFFSET 10 ROWS');
    expect(query._offset).toBe(10);
  });
  it('should parse FETCH NEXT # ROWS ONLY', () => {
    const query = new SelectBuilder(
      'SELECT * FROM mytable FETCH NEXT 10 ROWS ONLY'
    );
    expect(query._limit).toBe(10);
  });
});
describe('bare JOIN handler', () => {
  it('should split a bare JOIN from the FROM clause', () => {
    const sql = 'SELECT * FROM a JOIN b ON b.id = a.bid WHERE a.x = 1';
    const query = new SelectBuilder(sql);
    expect(query._tables).toEqual(['a']);
    expect(query._joins).toEqual(['JOIN b ON b.id = a.bid']);
    expect(query._wheres).toEqual(['a.x = 1']);
    expect(trim(query.compile().sql)).toBe(sql);
  });
  it('should handle multiple bare JOINs mixed with LEFT JOIN', () => {
    const query = new SelectBuilder(
      'SELECT * FROM a JOIN b ON b.id = a.bid LEFT JOIN c ON c.id = b.cid JOIN d ON d.id = c.did'
    );
    expect(query._tables).toEqual(['a']);
    expect(query._joins).toEqual([
      'JOIN b ON b.id = a.bid',
      'LEFT JOIN c ON c.id = b.cid',
      'JOIN d ON d.id = c.did',
    ]);
  });
  it('should unjoin a parsed bare JOIN', () => {
    const query = new SelectBuilder(
      'SELECT * FROM a JOIN b ON b.id = a.bid LEFT JOIN c ON c.id = a.cid WHERE a.x = 1'
    );
    query.unjoin('b');
    expect(trim(query.compile().sql)).toBe(
      'SELECT * FROM a LEFT JOIN c ON c.id = a.cid WHERE a.x = 1'
    );
  });
  it('should not split on identifiers containing "join"', () => {
    const sql =
      'SELECT joined_at, user_join FROM a JOIN b ON b.joined_at = a.user_join WHERE a.join_date = 1';
    const query = new SelectBuilder(sql);
    expect(query._columns).toEqual(['joined_at', 'user_join']);
    expect(query._tables).toEqual(['a']);
    expect(query._joins).toEqual(['JOIN b ON b.joined_at = a.user_join']);
    expect(query._wheres).toEqual(['a.join_date = 1']);
  });
  it('should handle multiple spaces and newlines between join keywords', () => {
    const query = new SelectBuilder(
      'SELECT * FROM a  INNER \n  JOIN b ON b.id = a.bid LEFT\n\tOUTER   JOIN c ON c.id = a.cid'
    );
    expect(query._joins).toEqual([
      'INNER JOIN b ON b.id = a.bid',
      'LEFT OUTER JOIN c ON c.id = a.cid',
    ]);
  });
  it('should handle NATURAL joins', () => {
    const query = new SelectBuilder(
      'SELECT * FROM a NATURAL JOIN b NATURAL LEFT JOIN c'
    );
    expect(query._tables).toEqual(['a']);
    expect(query._joins).toEqual(['NATURAL JOIN b', 'NATURAL LEFT JOIN c']);
    query.unjoin('b');
    expect(trim(query.compile().sql)).toBe(
      'SELECT * FROM a NATURAL LEFT JOIN c'
    );
  });
});
describe('pagination edge cases', () => {
  it('should parse LIMIT ALL as no limit', () => {
    const query = new SelectBuilder('SELECT * FROM t LIMIT ALL');
    expect(query._limit).toBeUndefined();
    expect(trim(query.compile({ engine: 'pg' }).sql)).toBe('SELECT * FROM t');
  });
  it('should parse LIMIT ALL OFFSET #', () => {
    const query = new SelectBuilder('select * from t limit all offset 5');
    expect(query._limit).toBeUndefined();
    expect(query._offset).toBe(5);
  });
  it('should resolve LIMIT and OFFSET named bindings', () => {
    const query = new SelectBuilder(
      'SELECT * FROM t WHERE a < :n LIMIT :n OFFSET :o',
      { n: 5, o: 10 }
    );
    expect(query._limit).toBe(5);
    expect(query._offset).toBe(10);
    const { sql, bindings } = query.compile({ engine: 'pg' });
    expect(trim(sql)).toBe('SELECT * FROM t WHERE a < $1 LIMIT 5 OFFSET 10');
    expect(bindings).toEqual([5]);
  });
  it('should resolve named bindings in LIMIT offset, count', () => {
    const query = new SelectBuilder('SELECT * FROM t LIMIT :o, :n', {
      o: 10,
      n: '5',
    });
    expect(query._limit).toBe(5);
    expect(query._offset).toBe(10);
  });
  it('should resolve a named binding in FETCH NEXT', () => {
    const query = new SelectBuilder('SELECT * FROM t FETCH NEXT :n ROWS ONLY', {
      n: 3,
    });
    expect(query._limit).toBe(3);
  });
  it('should validate named binding values', () => {
    expect(
      () => new SelectBuilder('SELECT * FROM t LIMIT :n', { n: 'abc' })
    ).toThrow('limit(n)');
    expect(
      () => new SelectBuilder('SELECT * FROM t OFFSET :n', { n: -1 })
    ).toThrow('offset(n)');
  });
  it('should throw on a named placeholder with no binding', () => {
    expect(() => new SelectBuilder('SELECT * FROM t LIMIT :n')).toThrow(
      /^Parser: .*no value was given for "n"/
    );
  });
  it('should throw on positional placeholders', () => {
    const cases: [string, RegExp][] = [
      ['SELECT * FROM t LIMIT ?', /Parser: .*LIMIT.*\.limit\(n\)/],
      ['SELECT * FROM t LIMIT $1', /Parser: .*LIMIT.*\.limit\(n\)/],
      ['SELECT * FROM t LIMIT 10, ?', /Parser: .*LIMIT.*\.limit\(n\)/],
      ['SELECT * FROM t LIMIT 5 OFFSET ?', /Parser: .*OFFSET.*\.offset\(n\)/],
      ['SELECT * FROM t OFFSET ? ROWS', /Parser: .*OFFSET.*\.offset\(n\)/],
      [
        'SELECT * FROM t FETCH NEXT ? ROWS ONLY',
        /Parser: .*FETCH NEXT.*\.limit\(n\)/,
      ],
    ];
    cases.forEach(([sql, error]) => {
      expect(() => new SelectBuilder(sql)).toThrow(error);
    });
  });
  it('should parse LIMIT # OFFSET # as separate clauses', () => {
    const query = new SelectBuilder('SELECT * FROM t LIMIT 5 OFFSET 2');
    expect(query._limit).toBe(5);
    expect(query._offset).toBe(2);
    expect(trim(query.compile({ engine: 'mysql' }).sql)).toBe(
      'SELECT * FROM t LIMIT 5 OFFSET 2'
    );
  });
  it('should parse OFFSET # ROWS FETCH NEXT # ROWS ONLY', () => {
    const sql =
      'SELECT * FROM t ORDER BY id OFFSET 10 ROWS FETCH NEXT 5 ROWS ONLY';
    const query = new SelectBuilder(sql);
    expect(query._offset).toBe(10);
    expect(query._limit).toBe(5);
    expect(trim(query.compile({ engine: 'mssql' }).sql)).toBe(sql);
  });
  it('should parse FETCH FIRST # ROWS ONLY', () => {
    const query = new SelectBuilder(
      'SELECT * FROM t ORDER BY id NULLS FIRST FETCH FIRST 10 ROWS ONLY'
    );
    expect(query._orderBys).toEqual(['id NULLS FIRST']);
    expect(query._limit).toBe(10);
  });
  it('should parse OFFSET 1 ROW FETCH FIRST ROW ONLY', () => {
    const query = new SelectBuilder(
      'SELECT * FROM t OFFSET 1 ROW FETCH FIRST ROW ONLY'
    );
    expect(query._offset).toBe(1);
    expect(query._limit).toBe(1);
  });
  it('should ignore a trailing semicolon', () => {
    const query = new SelectBuilder('SELECT * FROM t LIMIT 5 OFFSET 2;\n');
    expect(query._limit).toBe(5);
    expect(query._offset).toBe(2);
  });
});
