import type SelectBuilder from '../SelectBuilder/SelectBuilder';
import type { EngineStyle } from '../SelectBuilder/SelectBuilder';
import getPagination from '../getPagination/getPagination';

interface MysqlClient {
  query: (
    sql: string,
    bindings: any[],
    callback: (
      err: Error | null,
      results: Array<Record<string, any>>,
      fields: any[]
    ) => void
  ) => void;
}

interface MysqlAsyncClient {
  query: (
    sql: string,
    bindings: any[]
  ) => Promise<[Array<Record<string, any>>, any[]]>;
}

function _queryToPromise(
  mysqlClient: MysqlClient,
  sql: string,
  bindings: any[]
): Promise<[Array<Record<string, any>>, any[]]> {
  return new Promise((resolve, reject) => {
    mysqlClient.query(sql, bindings, (err, rows, fields) => {
      if (err) {
        reject(err);
        return;
      }
      resolve([rows, fields]);
    });
  });
}

/**
 * Run the given query with mysql and return the results
 * @param mysqlClient  A client created with mysql.createConnection()  or mysql.createPool()
 * @param query  The SelectBuilder query to run
 */
export async function runMysql(
  mysqlClient: MysqlClient,
  query: SelectBuilder
): Promise<[Array<Record<string, any>>, any[]]> {
  const { sql, bindings } = query.compile({ engine: 'mysql' });
  return _queryToPromise(mysqlClient, sql, bindings);
}

/**
 * Run the given query with mysql and return the results, count, and pagination
 * @param mysqlClient  A client created with mysql.createConnection()  or mysql.createPool()
 * @param query  The SelectBuilder query to run
 * @param options
 * @param options.countExpr  The SQL expression to use for the count (default "*")
 */
export async function runMysqlWithCount(
  mysqlClient: MysqlClient,
  query: SelectBuilder,
  { countExpr = '*' }: { countExpr?: string } = {}
) {
  const { sql, bindings } = query.compile({ engine: 'mysql' });
  const [records, fields] = await _queryToPromise(mysqlClient, sql, bindings);
  if (records.length > 0) {
    const { sql, bindings } = query.compileCount({
      engine: 'mysql',
      countExpr,
    });
    const [rows] = await _queryToPromise(mysqlClient, sql, bindings);
    const total = rows[0].found_rows;
    return { records, total, pagination: getPagination(query, total), fields };
  } else {
    return { records, total: 0, pagination: getPagination(query, 0), fields };
  }
}

export async function runMysqlAsync(
  mysqlClient: MysqlAsyncClient,
  query: SelectBuilder
): Promise<[Array<Record<string, any>>, any[]]> {
  const { sql, bindings } = query.compile({ engine: 'mysql' });
  return mysqlClient.query(sql, bindings);
}

export async function runMysqlAsyncWithCount(
  mysqlClient: MysqlAsyncClient,
  query: SelectBuilder,
  {
    engine = 'mysql',
    countExpr = '*',
  }: { engine?: EngineStyle; countExpr?: string } = {}
) {
  const { sql, bindings } = query.compile({ engine });
  const [records, fields] = await mysqlClient.query(sql, bindings);
  if (records.length > 0) {
    const { sql, bindings } = query.compileCount({ engine, countExpr });
    const [rows] = await mysqlClient.query(sql, bindings);
    const total = rows[0].found_rows;
    return { records, total, pagination: getPagination(query, total), fields };
  } else {
    return { records, total: 0, pagination: getPagination(query, 0), fields };
  }
}
