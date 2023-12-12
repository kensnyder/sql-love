import type SelectBuilder from '../SelectBuilder/SelectBuilder';
import type { EngineStyle } from '../SelectBuilder/SelectBuilder';
import getPagination from '../getPagination/getPagination';
import { toSafeJsonValue } from '../toSafeJson/toSafeJson';

interface PrismaClient {
  $queryRawUnsafe: (
    sql: string,
    ...bindings: any[]
  ) => Promise<Array<Record<string, any>>>;
}

/**
 * Run the given query with prisma and return the results
 * @param prisma  The prisma client instance
 * @param query  The SelectBuilder query to run
 * @param options
 * @param options.engine  The engine style to use ("mssql" | "mysql" | "oracle" | "pg")
 */
export async function runPrisma(
  prisma: PrismaClient,
  query: SelectBuilder,
  { engine = undefined }: { engine?: EngineStyle } = {}
): Promise<Array<Record<string, any>>> {
  const { sql, bindings } = query.compile({ engine });
  return prisma.$queryRawUnsafe(sql, ...bindings);
}

/**
 * Run the given query with prisma and return the results, count, and pagination
 * @param prisma  The prisma client instance
 * @param query  The SelectBuilder query to run
 * @param options
 * @param options.engine  The engine style to use ("mssql" | "mysql" | "oracle" | "pg")
 * @param options.countExpr  The SQL expression to use for the count (default "*")
 */
export async function runPrismaWithCount(
  prisma: PrismaClient,
  query: SelectBuilder,
  {
    engine = undefined,
    countExpr = '*',
  }: { engine?: EngineStyle; countExpr?: string } = {}
) {
  const { sql, bindings } = query.compile({ engine });
  const records = await prisma.$queryRawUnsafe(sql, ...bindings);
  if (records.length > 0) {
    const { sql, bindings } = query.compileCount({ engine, countExpr });
    const result = await prisma.$queryRawUnsafe(sql, ...bindings);
    const total = toSafeJsonValue(result[0].found_rows);
    return { records, total, pagination: getPagination(query, total) };
  } else {
    return { records, total: 0, pagination: getPagination(query, 0) };
  }
}
