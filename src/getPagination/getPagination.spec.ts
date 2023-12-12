import SelectBuilder from '../SelectBuilder/SelectBuilder';
import getPagination from './getPagination';

describe('getPagination()', () => {
  it('should handle 42 results with no offset', () => {
    const query = new SelectBuilder('SELECT * FROM users LIMIT 10');
    const pagination = getPagination(query, 42);
    expect(pagination).toEqual({
      page: 1,
      prevPage: null,
      nextPage: 2,
      perPage: 10,
      numPages: 5,
      total: 42,
      isFirst: true,
      isLast: false,
    });
  });
  it('should handle 42 results with offset', () => {
    const query = new SelectBuilder('SELECT * FROM users LIMIT 10').offset(20);
    const pagination = getPagination(query, 42n);
    expect(pagination).toEqual({
      page: 3,
      prevPage: 2,
      nextPage: 4,
      perPage: 10,
      numPages: 5,
      total: 42,
      isFirst: false,
      isLast: false,
    });
  });
  it('should handle 42 results with page', () => {
    const query = new SelectBuilder('SELECT * FROM users LIMIT 10').page(3);
    const pagination = getPagination(query, 42n);
    expect(pagination).toEqual({
      page: 3,
      prevPage: 2,
      nextPage: 4,
      perPage: 10,
      numPages: 5,
      total: 42,
      isFirst: false,
      isLast: false,
    });
  });
  it('should handle 0 results', () => {
    const query = new SelectBuilder('SELECT * FROM users LIMIT 10');
    const pagination = getPagination(query, 0);
    expect(pagination).toEqual({
      page: null,
      prevPage: null,
      nextPage: null,
      perPage: 10,
      numPages: 0,
      total: 0,
      isFirst: false,
      isLast: false,
    });
  });
  it('should handle when no limit is present', () => {
    const query = new SelectBuilder('SELECT * FROM users');
    const pagination = getPagination(query, 42);
    expect(pagination).toEqual({
      page: null,
      prevPage: null,
      nextPage: null,
      perPage: null,
      numPages: 0,
      total: 42,
      isFirst: false,
      isLast: false,
    });
  });
});
