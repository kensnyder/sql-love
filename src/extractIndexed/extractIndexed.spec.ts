import extractIndexed from './extractIndexed';

describe('extractIndexed()', () => {
  it('should handle indexing by string', () => {
    const records = [
      { uuid: '2d49f286-790d-4aee-b38b-94d0872e9bd8', name: 'John' },
      { uuid: '7d02664a-d03e-4882-88e2-23c701c314b5', name: 'Jane' },
    ];
    const indexed = extractIndexed('uuid', records);
    expect(indexed).toEqual({
      '2d49f286-790d-4aee-b38b-94d0872e9bd8': {
        uuid: '2d49f286-790d-4aee-b38b-94d0872e9bd8',
        name: 'John',
      },
      '7d02664a-d03e-4882-88e2-23c701c314b5': {
        uuid: '7d02664a-d03e-4882-88e2-23c701c314b5',
        name: 'Jane',
      },
    });
  });
  it('should handle indexing by integer', () => {
    const records = [
      { id: 1, name: 'John' },
      { id: 2, name: 'Jane' },
    ];
    const indexed = extractIndexed('id', records);
    expect(indexed).toEqual({
      1: { id: 1, name: 'John' },
      2: { id: 2, name: 'Jane' },
    });
  });
  it('should throw error if column is not present in every record', () => {
    const records = [
      { id: 1, name: 'John', employeeId: 'js102' },
      { id: 2, name: 'Jane' },
    ];
    const thrower = () => extractIndexed('employeeId', records);
    expect(thrower).toThrow();
  });
});
