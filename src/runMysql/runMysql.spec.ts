import { vi } from 'vitest';
import SelectBuilder from '../SelectBuilder/SelectBuilder';
import {
  runMysql,
  runMysqlAsync,
  runMysqlAsyncWithCount,
  runMysqlWithCount,
} from './runMysql';

describe('runMysql', () => {
  it('should invoke client.query with correct args', async () => {
    const mockResults = [
      { id: 1, name: 'John', dept: 'Marketing' },
      { id: 2, name: 'Jane', dept: 'Marketing' },
    ];
    const mockFields = [{ name: 'id' }, { name: 'name' }, { name: 'dept' }];
    const client = {
      query: vi.fn(
        (
          sql: string,
          bindings: any[],
          callback: (
            err: Error | null,
            rows: Array<Record<string, any>>,
            fields: any[]
          ) => void
        ) => {
          callback(null, mockResults, mockFields);
        }
      ),
    };
    const query = new SelectBuilder('SELECT * FROM users').where(
      'dept',
      'Marketing'
    );
    const [results, fields] = await runMysql(client, query);
    expect(client.query.mock.calls[0][0]).toBe(
      'SELECT\n  *\nFROM users\nWHERE dept = ?'
    );
    expect(client.query.mock.calls[0][1]).toEqual(['Marketing']);
    expect(results).toBe(mockResults);
    expect(fields).toBe(mockFields);
  });
  it('should also run with count', async () => {
    const mockResults1 = [
      { id: 1, name: 'John', dept: 'Marketing' },
      { id: 2, name: 'Jane', dept: 'Marketing' },
    ];
    const mockFields1 = [{ name: 'id' }, { name: 'name' }, { name: 'dept' }];
    const mockResults2 = [{ found_rows: 9 }];
    const mockFields2 = [{ name: 'found_rows' }];
    let callCount = 0;
    const client = {
      query: vi.fn(
        (
          sql: string,
          bindings: any[],
          callback: (
            err: Error | null,
            rows: Array<Record<string, any>>,
            fields: any[]
          ) => void
        ) => {
          if (++callCount === 1) {
            callback(null, mockResults1, mockFields1);
          }
          callback(null, mockResults2, mockFields2);
        }
      ),
    };
    const query = new SelectBuilder('SELECT * FROM users')
      .where('dept', 'Marketing')
      .limit(2)
      .page(5);
    const { records, total, pagination } = await runMysqlWithCount(
      client,
      query
    );
    expect(client.query.mock.calls[0][0]).toBe(
      'SELECT\n  *\nFROM users\nWHERE dept = ?\nOFFSET 8\nLIMIT 2'
    );
    expect(client.query.mock.calls[0][1]).toEqual(['Marketing']);
    expect(records).toBe(mockResults1);
    expect(total).toBe(9);
    expect(pagination).toEqual({
      page: 5,
      prevPage: 4,
      nextPage: null,
      perPage: 2,
      numPages: 5,
      total: 9,
      isFirst: false,
      isLast: true,
    });
  });
  it('should invoke client.query with correct args (async)', async () => {
    const mockResults = [
      { id: 1, name: 'John', dept: 'Marketing' },
      { id: 2, name: 'Jane', dept: 'Marketing' },
    ];
    const mockFields = [{ name: 'id' }, { name: 'name' }, { name: 'dept' }];
    const client = {
      query: vi.fn((sql: string, bindings: any[]) => {
        return Promise.resolve([mockResults, mockFields]);
      }),
    };
    const query = new SelectBuilder('SELECT * FROM users').where(
      'dept',
      'Marketing'
    );
    // @ts-expect-error
    const [results, fields] = await runMysqlAsync(client, query);
    expect(client.query).toHaveBeenCalledWith(
      'SELECT\n  *\nFROM users\nWHERE dept = ?',
      ['Marketing']
    );
    expect(results).toBe(mockResults);
    expect(fields).toBe(mockFields);
  });
  it('should also run with count (async)', async () => {
    const mockResults1 = [
      { id: 1, name: 'John', dept: 'Marketing' },
      { id: 2, name: 'Jane', dept: 'Marketing' },
    ];
    const mockFields1 = [{ name: 'id' }, { name: 'name' }, { name: 'dept' }];
    const mockResults2 = [{ found_rows: 9 }];
    const mockFields2 = [{ name: 'found_rows' }];
    let callCount = 0;
    const client = {
      query: vi.fn((sql: string, bindings: any[]) => {
        if (++callCount === 1) {
          return Promise.resolve([mockResults1, mockFields1]);
        }
        return Promise.resolve([mockResults2, mockFields2]);
      }),
    };
    const query = new SelectBuilder('SELECT * FROM users')
      .where('dept', 'Marketing')
      .limit(2)
      .page(5);
    const { records, total, pagination, fields } = await runMysqlAsyncWithCount(
      client,
      query
    );
    expect(client.query).toHaveBeenCalledWith(
      'SELECT\n  *\nFROM users\nWHERE dept = ?\nOFFSET 8\nLIMIT 2',
      ['Marketing']
    );
    expect(records).toBe(mockResults1);
    expect(total).toBe(9);
    expect(pagination).toEqual({
      page: 5,
      prevPage: 4,
      nextPage: null,
      perPage: 2,
      numPages: 5,
      total: 9,
      isFirst: false,
      isLast: true,
    });
    expect(fields).toEqual(mockFields1);
  });
});
