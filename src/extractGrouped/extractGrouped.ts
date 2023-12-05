/**
 * Group database rows by a column value
 * @param field  The database column to group by
 * @param records  Records from the database
 * @example
 * extractGrouped('org', users); // result:
 * {
 *     "Marketing": [
 *         { id: 1, name: "John", org: "Marketing" },
 *         { id: 2, name: "Jane", org: "Marketing" },
 *     ],
 *     "Finance": [
 *         { id: 3, name: "Jose", org: "Finance" },
 *     ],
 * }
 */
export default function extractGrouped<DbRecord extends Record<string, any>>(
  field: keyof DbRecord,
  records: DbRecord[]
): Record<string, DbRecord[]> {
  let idx = 0;
  const grouped: Record<string, DbRecord[]> = {};
  for (const record of records) {
    if (!(field in record)) {
      throw new Error(
        `Column "${String(field)}" is not present in record ${idx}`
      );
    }
    if (!grouped[record[field]]) {
      grouped[record[field]] = [];
    }
    grouped[record[field]].push(record);
    idx++;
  }
  return grouped;
}
