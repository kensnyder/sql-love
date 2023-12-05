import extractGrouped from './extractGrouped';

describe('extractGrouped()', () => {
  it('should handle grouping by string', () => {
    const records = [
      { id: 1, name: 'John', dept: 'Marketing' },
      { id: 2, name: 'Jane', dept: 'Finance' },
      { id: 3, name: 'Tim', dept: 'Marketing' },
    ];
    const grouped = extractGrouped('dept', records);
    expect(grouped).toEqual({
      Marketing: [
        { id: 1, name: 'John', dept: 'Marketing' },
        { id: 3, name: 'Tim', dept: 'Marketing' },
      ],
      Finance: [{ id: 2, name: 'Jane', dept: 'Finance' }],
    });
  });
  it('should handle grouping by integer', () => {
    const records = [
      { id: 1, name: 'John', deptId: 1 },
      { id: 2, name: 'Jane', deptId: 2 },
      { id: 3, name: 'Tim', deptId: 1 },
    ];
    const grouped = extractGrouped('deptId', records);
    expect(grouped).toEqual({
      1: [
        { id: 1, name: 'John', deptId: 1 },
        { id: 3, name: 'Tim', deptId: 1 },
      ],
      2: [{ id: 2, name: 'Jane', deptId: 2 }],
    });
  });
  it('should throw error if column is not present in every record', () => {
    const records = [
      { id: 1, name: 'John', deptId: 1 },
      { id: 2, name: 'Jane', deptId: 2 },
      { id: 3, name: 'Tim' },
    ];
    const thrower = () => extractGrouped('deptId', records);
    expect(thrower).toThrow();
  });
});
