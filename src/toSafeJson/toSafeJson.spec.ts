import { toSafeJsonRecords, toSafeJsonString } from './toSafeJson';

describe('toSafeJsonString()', () => {
  it('should convert small BigInt to Number', () => {
    const records = [{ found_rows: 30n }];
    const json = toSafeJsonString(records);
    expect(json).toBe('[{"found_rows":30}]');
  });
  it('should convert large BigInt to String', () => {
    const myBigInt = BigInt(String(Number.MAX_SAFE_INTEGER) + '0');
    const records = [{ found_rows: myBigInt }];
    const json = toSafeJsonString(records);
    expect(json).toBe(`[{"found_rows":"${myBigInt.toString()}"}]`);
  });
  it('should convert Date to ISO String', () => {
    const date = new Date('2023-12-06');
    const records = [{ date }];
    const json = toSafeJsonString(records);
    expect(json).toBe(`[{"date":"${date.toISOString()}"}]`);
  });
});
describe('jsonSafePrisma()', () => {
  it('should convert small BigInt to Number', () => {
    const records = [{ found_rows: 30n }];
    const json = toSafeJsonRecords(records);
    expect(json).toStrictEqual([{ found_rows: 30 }]);
  });
  it('should convert large BigInt to String', () => {
    const myBigInt = BigInt(String(Number.MAX_SAFE_INTEGER) + '0');
    const records = [{ found_rows: myBigInt }];
    const json = toSafeJsonRecords(records);
    expect(json).toStrictEqual([{ found_rows: myBigInt.toString() }]);
  });
  it('should convert Date to ISO String', () => {
    const date = new Date('2023-12-06');
    const records = [{ date }];
    const json = toSafeJsonRecords(records);
    expect(json).toStrictEqual([{ date: date.toISOString() }]);
  });
});
