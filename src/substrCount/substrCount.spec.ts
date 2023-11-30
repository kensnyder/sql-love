import substrCount from './substrCount';

describe('substrCount', function () {
  it('should see 0', function () {
    const haystack = 'hello world';
    const needle = '?';
    expect(substrCount(haystack, needle)).toBe(0);
  });
  it('should see 0 from empty string', function () {
    const haystack = '';
    const needle = '?';
    expect(substrCount(haystack, needle)).toBe(0);
  });
  it('should see 1', function () {
    const haystack = 'hello world?';
    const needle = '?';
    expect(substrCount(haystack, needle)).toBe(1);
  });
  it('should see 2 adjacent', function () {
    const haystack = 'hello world??';
    const needle = '?';
    expect(substrCount(haystack, needle)).toBe(2);
  });
  it('should see 3', function () {
    const haystack = '?hello world??';
    const needle = '?';
    expect(substrCount(haystack, needle)).toBe(3);
  });
});
