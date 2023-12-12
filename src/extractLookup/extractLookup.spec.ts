import extractLookup from './extractLookup';

describe('extractLookup()', () => {
  it('should handle lookup by number', () => {
    const records = [
      { id: 1, name: 'John', age: 30 },
      { id: 2, name: 'Jane', age: 35 },
    ];
    const nameById = extractLookup('id', 'name', records);
    expect(nameById).toEqual({ '1': 'John', '2': 'Jane' });
  });
  it('should handle lookups with non-unique fields', () => {
    const records = [
      { id: 1, name: 'John', age: 30 },
      { id: 2, name: 'Jane', age: 30 },
    ];
    const ageById = extractLookup('age', 'name', records);
    expect(ageById).toEqual({ '30': 'Jane' });
  });
  it('should throw if key field is not present', () => {
    const records = [
      { id: 1, name: 'John', age: 30 },
      { id: 2, name: 'Jane' },
    ];
    // @ts-expect-error
    const thrower = () => extractLookup('age', 'name', records);
    expect(thrower).toThrow();
  });
  it('should throw if value field is not present', () => {
    const records = [
      { id: 1, name: 'John', age: 30 },
      { id: 2, name: 'Jane' },
    ];
    // @ts-expect-error
    const thrower = () => extractLookup('id', 'age', records);
    expect(thrower).toThrow();
  });
});
