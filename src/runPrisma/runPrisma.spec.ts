import { describe, expect, it, jest } from 'bun:test';
import SelectBuilder from '../SelectBuilder/SelectBuilder';
import { runPrisma, runPrismaWithCount } from './runPrisma';

describe('runPrisma', () => {
  it('should invoke prisma.$queryRawUnsafe with correct args', async () => {
    const mockResults = [
      { id: 1, name: 'John', dept: 'Marketing' },
      { id: 2, name: 'Jane', dept: 'Marketing' },
    ];
    const prisma = {
      $queryRawUnsafe: jest.fn(() => mockResults),
    };
    const query = new SelectBuilder('SELECT * FROM users');
    query.where('dept', 'Marketing');
    // @ts-expect-error
    const results = await runPrisma(prisma, query, { engine: 'mysql' });
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(
      'SELECT\n  *\nFROM users\nWHERE dept = ?',
      'Marketing'
    );
    expect(results).toBe(mockResults);
  });
  it('should also run with count', async () => {
    const mockResults1 = [
      { id: 1, name: 'John', dept: 'Marketing' },
      { id: 2, name: 'Jane', dept: 'Marketing' },
    ];
    const mockResults2 = [{ found_rows: 9 }];
    let callCount = 0;
    const prisma = {
      $queryRawUnsafe: jest.fn(() => {
        if (++callCount === 1) {
          return mockResults1;
        }
        return mockResults2;
      }),
    };
    const query = new SelectBuilder('SELECT * FROM users')
      .where('dept', 'Marketing')
      .limit(2)
      .page(5);
    const { records, total, pagination } = await runPrismaWithCount(
      // @ts-expect-error
      prisma,
      query,
      { engine: 'mysql' }
    );
    // @ts-expect-error
    expect(prisma.$queryRawUnsafe.mock.calls[0][0]).toBe(
      // @ts-expect-error
      'SELECT\n  *\nFROM users\nWHERE dept = ?\nOFFSET 8\nLIMIT 2'
    );
    // @ts-expect-error
    expect(prisma.$queryRawUnsafe.mock.calls[0][1]).toBe('Marketing');
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
  it('should handle when recordset is empty', async () => {
    const prisma = {
      $queryRawUnsafe: jest.fn(() => []),
    };
    const query = new SelectBuilder('SELECT * FROM users')
      .where('dept', 'Marketing')
      .limit(2)
      .page(5);
    const { records, total, pagination } = await runPrismaWithCount(
      // @ts-expect-error
      prisma,
      query,
      { engine: 'mysql' }
    );
    // @ts-expect-error
    expect(prisma.$queryRawUnsafe.mock.calls[0][0]).toBe(
      // @ts-expect-error
      'SELECT\n  *\nFROM users\nWHERE dept = ?\nOFFSET 8\nLIMIT 2'
    );
    // @ts-expect-error
    expect(prisma.$queryRawUnsafe.mock.calls[0][1]).toBe('Marketing');
    expect(records).toStrictEqual([]);
    expect(total).toBe(0);
    expect(pagination).toEqual({
      page: null,
      prevPage: null,
      nextPage: null,
      perPage: 2,
      numPages: 0,
      total: 0,
      isFirst: false,
      isLast: false,
    });
  });
});
