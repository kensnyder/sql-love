/**
 * Given an array of records, extract an object with keyField-valueField pairs
 * @param records  An array of records
 * @param keyField  The field to use as the key
 * @param valueField  The field to use as the value
 */
export default function extractLookup<
  T extends Array<Record<K | V, any>>,
  K extends keyof T[number],
  V extends keyof T[number],
>(
  keyField: K,
  valueField: V,
  records: T
): { [key in T[number][K]]: T[number][V] } {
  const lookup: { [key in T[number][K]]: T[number][V] } = {} as any;
  let idx = 0;
  for (const record of records) {
    if (!(keyField in record)) {
      throw new Error(
        `Column "${String(keyField)}" is not present in record ${idx}`
      );
    }
    if (!(valueField in record)) {
      throw new Error(
        `Column "${String(valueField)}" is not present in record ${idx}`
      );
    }
    idx++;
    lookup[String(record[keyField])] = record[valueField];
  }
  return lookup;
}
