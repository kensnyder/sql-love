type SafeValue<T> = T extends BigInt ? number | string : T;
type SafeRecord<T> = Record<string, SafeValue<T>>;
type SafeRecords<T> = Array<SafeRecord<T>>;

/**
 * Convert a value to a value that can be safely serialized to JSON
 * @param value
 */
export function toSafeJsonValue<T>(value: T): SafeValue<T> {
  if (typeof value === 'bigint') {
    const asNumber = Number(value);
    // Use double equals instead of triple equals below to check if the BigInt
    //   is too big to fit in a JS Number.
    //   If so, then return it as a string, otherwise return it as a Number
    // @ts-expect-error
    return value == asNumber ? asNumber : value.toString();
  }
  return value as SafeValue<T>;
}

/**
 * Convert a record to one that can be safely serialized to JSON
 * @param record
 */
export function toSafeJsonRecord<T extends Record<string, any>>(
  record: T
): SafeRecord<T> {
  const newRecord = {} as SafeRecord<T>;
  for (const key in record) {
    /* v8 ignore next 3 */
    if (!Object.prototype.hasOwnProperty.call(record, key)) {
      continue;
    }
    newRecord[key] = toSafeJsonValue(record[key]);
  }
  return newRecord;
}

/**
 * Convert a recordset to one that can be safely serialized to JSON
 * @param records
 */
export function toSafeJsonRecords<T extends Record<string, any>>(
  records: T[]
): SafeRecords<T> {
  return records.map(toSafeJsonRecord);
}

/**
 * JSON stringify a value or data structure, ensuring first that all values are
 *   safe to serialize
 * @param records
 */
export function toSafeJsonString(records: Array<Record<string, any>>) {
  return JSON.stringify(records, (_, value: any) => toSafeJsonValue(value));
}
