import { resetQuoter, setQuoter } from '../defaultEngine/defaultEngine';
import InsertBuilder from './InsertBuilder';

describe('InsertBuilder()', () => {
  beforeEach(resetQuoter);
  afterAll(resetQuoter);
  it('should handle inserting one', () => {
    const insert = new InsertBuilder('users');
    insert.record({ first: 'Magnus', last: 'Carlsen' });
    const { sql, bindings } = insert.compile();
    expect(sql).toBe('INSERT INTO users (first, last) VALUES (?, ?)');
    expect(bindings).toEqual(['Magnus', 'Carlsen']);
  });
  it('should handle inserting two records with two record() calls', () => {
    const insert = new InsertBuilder('users');
    insert.record({ first: 'Magnus', last: 'Carlsen' });
    insert.record({ first: 'Fabiano', last: 'Caruana' });
    const { sql, bindings } = insert.compile();
    expect(sql).toBe('INSERT INTO users (first, last) VALUES (?, ?), (?, ?)');
    expect(bindings).toEqual(['Magnus', 'Carlsen', 'Fabiano', 'Caruana']);
  });
  it('should handle inserting two records with one records() call', () => {
    const insert = new InsertBuilder('users');
    insert.records([
      { first: 'Magnus', last: 'Carlsen' },
      { first: 'Fabiano', last: 'Caruana' },
    ]);
    const { sql, bindings } = insert.compile();
    expect(sql).toBe('INSERT INTO users (first, last) VALUES (?, ?), (?, ?)');
    expect(bindings).toEqual(['Magnus', 'Carlsen', 'Fabiano', 'Caruana']);
  });
  it('should handle returning with string', () => {
    const insert = new InsertBuilder('users');
    insert.record({ first: 'Magnus', last: 'Carlsen' });
    insert.returning('id, first');
    const { sql, bindings } = insert.compile();
    expect(sql).toBe(
      'INSERT INTO users (first, last) VALUES (?, ?) RETURNING id, first'
    );
    expect(bindings).toEqual(['Magnus', 'Carlsen']);
  });
  it('should handle returning with string array', () => {
    const insert = new InsertBuilder('users');
    insert.record({ first: 'Magnus', last: 'Carlsen' });
    insert.returning(['id', 'first']);
    const { sql, bindings } = insert.compile();
    expect(sql).toBe(
      'INSERT INTO users (first, last) VALUES (?, ?) RETURNING id, first'
    );
    expect(bindings).toEqual(['Magnus', 'Carlsen']);
  });
  it('should respect quoter', () => {
    setQuoter(s => `\`${s}\``);
    const insert = new InsertBuilder('users');
    insert.record({ first: 'Magnus', last: 'Carlsen' });
    insert.returning(['id', 'first']);
    const { sql, bindings } = insert.compile();
    expect(sql).toBe(
      'INSERT INTO users (`first`, `last`) VALUES (?, ?) RETURNING `id`, `first`'
    );
    expect(bindings).toEqual(['Magnus', 'Carlsen']);
  });
});
