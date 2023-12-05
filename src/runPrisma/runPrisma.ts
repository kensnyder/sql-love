import type SelectBuilder from '../SelectBuilder/SelectBuilder';
import type { EngineStyle } from '../SelectBuilder/SelectBuilder';
import getPagination from '../getPagination/getPagination';

interface PrismaClient {
  $queryRawUnsafe: (
    sql: string,
    ...bindings: any[]
  ) => Promise<Array<Record<string, any>>>;
}

export async function runPrisma(
  prisma: PrismaClient,
  query: SelectBuilder,
  { engine = undefined }: { engine?: EngineStyle } = {}
): Promise<Array<Record<string, any>>> {
  const { sql, bindings } = query.compile({ engine });
  return prisma.$queryRawUnsafe(sql, ...bindings);
}

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
    const total = result[0].found_rows;
    return { records, total, pagination: getPagination(query, total) };
  } else {
    return { records, total: 0, pagination: getPagination(query, 0) };
  }
}
