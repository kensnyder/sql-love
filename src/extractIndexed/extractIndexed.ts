/**
 * Index each database row by a column value
 * @param field  The database column to index by
 * @param records  Records from the database
 * @example
 * extractIndexed('id', users); // result:
 * {
 *   "1": { id: 1, name: "John" },
 *   "2": { id: 2, name: "Jane" },
 * }
 */
export default function extractIndexed<DbRecord extends Record<string, any>>(
  field: keyof DbRecord,
  records: DbRecord[]
) {
  let idx = 0;
  const indexed: Record<string, DbRecord> = {};
  for (const record of records) {
    if (!(field in record)) {
      throw new Error(
        `Column "${String(field)}" is not present in record ${idx}`
      );
    }
    indexed[record[field]] = record;
    idx++;
  }
  return indexed;
}
