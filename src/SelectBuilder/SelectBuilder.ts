import Parser from '../Parser/Parser';
import substrCount from '../substrCount/substrCount';

export type FieldName =
  | 'option'
  | 'options'
  | 'select'
  | 'column'
  | 'columns'
  | 'table'
  | 'tables'
  | 'join'
  | 'joins'
  | 'where'
  | 'wheres'
  | 'having'
  | 'havings'
  | 'groupBy'
  | 'groupBys'
  | 'orderBy'
  | 'orderBys'
  | 'limit'
  | 'offset'
  | 'page';

export type EngineStyle = 'mssql' | 'mysql' | 'oracle' | 'pg';

export type WhereCriteria =
  [string, string, any] | [string, any] | [string] | [Record<string, any>];

const isNullish = (v: any) =>
  v === undefined || v === null || v === false || Object.is(NaN, v);

let defaultEngine: EngineStyle = 'mysql';

/**
 * The largest LIMIT MySQL accepts; used to express OFFSET without a LIMIT
 * @see https://dev.mysql.com/doc/refman/8.0/en/select.html
 */
const MYSQL_MAX_LIMIT = '18446744073709551615';

/**
 * SelectBuilder properties holding lists of clause fragments
 */
type ArrayFieldProp =
  | '_options'
  | '_columns'
  | '_tables'
  | '_joins'
  | '_wheres'
  | '_groupBys'
  | '_havings'
  | '_orderBys';

/**
 * SelectBuilder properties holding single numeric values
 */
type ScalarFieldProp = '_limit' | '_offset' | '_page';

/**
 * Map of every accepted reset() field name to the property it clears
 */
const FIELD_PROPS = {
  option: '_options',
  options: '_options',
  select: '_columns',
  column: '_columns',
  columns: '_columns',
  table: '_tables',
  tables: '_tables',
  join: '_joins',
  joins: '_joins',
  where: '_wheres',
  wheres: '_wheres',
  having: '_havings',
  havings: '_havings',
  groupBy: '_groupBys',
  groupBys: '_groupBys',
  orderBy: '_orderBys',
  orderBys: '_orderBys',
  limit: '_limit',
  offset: '_offset',
  page: '_page',
} as const satisfies Record<FieldName, ArrayFieldProp | ScalarFieldProp>;

const SCALAR_FIELD_PROPS: ReadonlySet<string> = new Set<ScalarFieldProp>([
  '_limit',
  '_offset',
  '_page',
]);

function isScalarFieldProp(
  prop: ArrayFieldProp | ScalarFieldProp
): prop is ScalarFieldProp {
  return SCALAR_FIELD_PROPS.has(prop);
}

/**
 * Look up the property for a reset() field name, throwing on unknown names
 */
function getFieldProp(name: FieldName): ArrayFieldProp | ScalarFieldProp {
  if (
    typeof name !== 'string' ||
    !Object.prototype.hasOwnProperty.call(FIELD_PROPS, name)
  ) {
    throw new Error(
      `SelectBuilder.reset(): unknown field ${JSON.stringify(name)}; ` +
        `expected one of: ${Object.keys(FIELD_PROPS).join(', ')}`
    );
  }
  return FIELD_PROPS[name];
}

/**
 * Operators that may trail a column name in the 2-argument form of where()
 * e.g. "price >" or "status NOT IN"
 */
const trailingOperatorRegex =
  /\s(=|!=|<>|<=|>=|<|>|(?:NOT\s+)?IN|(?:NOT\s+)?I?LIKE(?:\s+%?\??%?)?|(?:NOT\s+)?BETWEEN)$/i;

/**
 * Return true if the given string is a stand-alone expression such as
 * "deleted_at IS NULL" or "id IN (SELECT id FROM phone)" rather than
 * a bare column name ("id") or a column plus operator ("price >")
 */
function isStandaloneExpression(column: string) {
  return /\s/.test(column) && !trailingOperatorRegex.test(column);
}

/**
 * Matches the operator part of a 2-argument where() LIKE condition that has
 * a "?" infix, e.g. the "LIKE %?%" in where('name LIKE %?%', 'joe').
 * Such strings always use the column + operator form, never the raw
 * "?" placeholder form, even when given an array of values.
 */
const likeInfixRegex = /^(?:NOT )?I?LIKE (?:\?|\?%|%\?|%\?%)$/i;

/**
 * Keywords that, when they come right before a trailing "?", make that "?" a
 * value placeholder (e.g. "a IS NOT ?") rather than a jsonb operator
 */
const keywordBeforePlaceholderRegex =
  /\b(?:IS|NOT|IN|LIKE|ILIKE|RLIKE|REGEXP|GLOB|BETWEEN|AND|OR|XOR|DIV|MOD|WHEN|THEN|ELSE|ESCAPE|FROM|TO|ZONE)$/i;

/**
 * Return true if the expression ends in a Postgres jsonb key-existence
 * operator (?, ?| or ?&) applied to the preceding operand, e.g. "tags ?",
 * "tags ?|" or "data->'a' ?", rather than in a "?" placeholder that follows an
 * operator, e.g. "a = ?", "COUNT(*) > ?" or "a IS NOT ?"
 */
function endsWithJsonbOperator(expression: string) {
  const match = expression.match(/^([\s\S]*\S)\s+\?([|&]?)$/);
  if (!match) {
    return false;
  }
  if (match[2]) {
    // "?|" and "?&" are never placeholders
    return true;
  }
  const before = match[1];
  if (/[=<>!+\-*/%|&^~,(]$/.test(before)) {
    // e.g. "a = ?" or "data -> ?"
    return false;
  }
  return !keywordBeforePlaceholderRegex.test(before);
}

/**
 * Escape a string for literal use inside a RegExp
 */
function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Matches the join type at the start of a stored join string, e.g. "JOIN ",
 * "LEFT JOIN " or "left outer join ". Join keywords are matched
 * case-insensitively; table names (which may be case-sensitive) are not.
 */
const joinPrefixSource = (() => {
  const ci = (word: string) =>
    word.replace(/[a-z]/gi, c => `[${c.toUpperCase()}${c.toLowerCase()}]`);
  const types = ['INNER', 'CROSS', 'LEFT', 'RIGHT', 'FULL', 'OUTER', 'NATURAL'];
  return `^\\s*(?:(?:${types.map(ci).join('|')})\\s+)*${ci('JOIN')}\\s+`;
})();

const isNullOrUndefined = (v: any) => v === null || v === undefined;

/**
 * Matches a SELECT option that removes duplicate rows
 * (DISTINCT, DISTINCTROW or Postgres "DISTINCT ON (...)")
 */
const distinctOptionRegex = /\bDISTINCT(?:ROW)?\b/i;

/**
 * Return true if the entire expression is enclosed in one matching pair of
 * parentheses, e.g. "(a = 1 OR b = 2)" but not "(a = 1) OR (b = 2)".
 * Parens inside quoted strings/identifiers are ignored. Anything that can't
 * be scanned reliably (backslash escapes, comments, dollar quoting) returns
 * false so callers fall back to adding their own parentheses.
 */
function isWrappedInParens(sql: string) {
  const s = sql.trim();
  if (!s.startsWith('(') || !s.endsWith(')')) {
    return false;
  }
  if (/\\|--|\/\*|\$\w*\$/.test(s)) {
    return false;
  }
  let depth = 0;
  let quote = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quote) {
      // a doubled quote ('') simply closes then reopens the string
      if (ch === quote) {
        quote = '';
      }
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
    } else if (ch === '(') {
      depth++;
    } else if (ch === ')') {
      depth--;
      if (depth <= 0 && i < s.length - 1) {
        // the opening paren closed before the end of the string
        return false;
      }
    }
  }
  return depth === 0 && quote === '';
}

/**
 * Wrap the given expression in parentheses unless it is already fully wrapped
 */
function wrapInParens(sql: string) {
  return isWrappedInParens(sql) ? sql : `(${sql})`;
}

export default class SelectBuilder {
  /**
   * The list of values to bind to the query
   * @private
   */
  _bindings: any[] = [];
  /**
   * The list of strings to come immediately after "SELECT"
   * and before column names
   * @private
   */
  _options: string[] = [];
  /**
   * The list of tables in the FROM clause
   * @private
   */
  _tables: string[] = [];
  /**
   * The list of column names to select
   * @private
   */
  _columns: string[] = [];
  /**
   * The list of JOIN strings to add
   * @private
   */
  _joins: string[] = [];
  /**
   * The list of WHERE clauses to join with AND
   * @private
   */
  _wheres: string[] = [];
  /**
   * The list of GROUP BY clauses to join with commas
   * @private
   */
  _groupBys: string[] = [];
  /**
   * The list of HAVING clauses to join with AND
   * @private
   */
  _havings: string[] = [];
  /**
   * The list of ORDER BY clauses to join with commas
   * @private
   */
  _orderBys: string[] = [];
  /**
   * The LIMIT to use
   * @private
   */
  _limit?: number;
  /**
   * The OFFSET to use
   * @private
   */
  _offset?: number;
  /**
   * The page used to construct an OFFSET based on the LIMIT
   * @private
   */
  _page?: number;

  /**
   * Select constructor
   * @param [sql]  A base SQL query to parse
   * @param [bindings]  Placeholders to bind to the query
   */
  constructor(sql?: string, bindings: Record<string, any> = {}) {
    if (sql) {
      const keys = bindings ? Object.keys(bindings) : [];
      if (keys.length > 0) {
        const names = keys
          .sort((a, b) => b.length - a.length)
          .map(escapeRegExp)
          .join('|');
        const regexp = new RegExp(`(?<!:):(${names})\\b`, 'g');
        sql = sql.replace(regexp, ($0, $1) => this._bind(bindings[$1]));
      }
      new Parser(this).parse(sql);
    }
  }

  /**
   * Set the default database engine style (mssql, mysql, oracle, pg)
   * @param engine
   */
  static setDefaultEngine(engine: EngineStyle) {
    defaultEngine = engine;
    return SelectBuilder;
  }

  /**
   * Get the SQL as a pretty-printed string alongside an array of bindings
   * @param engine  The database engine style (mssql, mysql, oracle, pg)
   * @return The SQL query as a string
   */
  compile({
    engine = defaultEngine,
    bindingIndex = 1,
  }: {
    engine?: EngineStyle;
    bindingIndex?: number;
  } = {}) {
    // build all the lines
    const lines = [
      'SELECT',
      this._options.length ? `  ${this._options.join('\n  ')}` : null,
      this._columns.length ? `  ${this._columns.join(',\n  ')}` : '  *\n',
      `FROM ${this._tables.join(', ')}`,
      this._joins.length ? this._joins.join('\n') : null,
      this._wheres.length ? `WHERE ${this._wheres.join('\n  AND ')}` : null,
      this._groupBys.length ? `GROUP BY ${this._groupBys.join(',\n  ')}` : null,
      this._havings.length ? `HAVING ${this._havings.join('\n  AND ')}` : null,
      this._orderBys.length ? `ORDER BY ${this._orderBys.join(',\n  ')}` : null,
    ];
    lines.push(...this._compilePagination(engine));

    const pretty = lines.filter(Boolean).join('\n').trim();
    const bindings: any = [];
    let idx = bindingIndex;
    // placeholder style expected by the common driver for each engine:
    // pg => $1 (pg), oracle => :1 (node-oracledb),
    // mssql => @P1 (Prisma's documented SQL Server raw query syntax)
    const placeholder: () => string =
      engine === 'pg'
        ? () => '$' + idx++
        : engine === 'oracle'
          ? () => ':' + idx++
          : engine === 'mssql'
            ? () => '@P' + idx++
            : () => '?';
    const sql = pretty.replace(/__BOUND_(\d+)__/g, (_, $1: string) => {
      bindings.push(this._bindings[Number($1)]);
      return placeholder();
    });
    return { sql, bindings };
  }

  /**
   * Build the lines needed to apply LIMIT/OFFSET/page for the given engine
   * @param engine  The database engine style (mssql, mysql, oracle, pg)
   * @return  Zero or more SQL lines to append after ORDER BY
   * @private
   */
  _compilePagination(engine: EngineStyle): string[] {
    const limit = this._limit;
    let offset = this._offset;
    if (this._page && this._page > 0 && this._limit) {
      offset = (this._page - 1) * this._limit;
    }
    if (!limit && !offset) {
      return [];
    }
    const lines: string[] = [];
    if (engine === 'mssql' && this._orderBys.length === 0) {
      // OFFSET/FETCH requires an ORDER BY clause
      lines.push('ORDER BY (SELECT NULL)');
    }
    const limitSql = this._compileLIMIT(engine, limit);
    const offsetSql = this._compileOFFSET(engine, offset);
    if (engine === 'mysql' || engine === 'pg') {
      lines.push(limitSql, offsetSql);
    } else {
      lines.push(offsetSql, limitSql);
    }
    return lines.filter(Boolean) as string[];
  }

  /**
   * Get the LIMIT/FETCH clause for the given engine
   * @param engineStyle  The database engine style (mssql, mysql, oracle, pg)
   * @param limit  The max number of rows (or undefined for no limit)
   * @private
   */
  _compileLIMIT(engineStyle: EngineStyle, limit?: number) {
    if (engineStyle === 'mysql') {
      // MySQL has no OFFSET without LIMIT; use the documented "no limit" value
      return `LIMIT ${limit || MYSQL_MAX_LIMIT}`;
    }
    if (!limit) {
      return undefined;
    }
    if (engineStyle === 'pg') {
      return `LIMIT ${limit}`;
    }
    // mssql and oracle 12c+
    return `FETCH NEXT ${limit} ROWS ONLY`;
  }

  /**
   * Get the OFFSET clause for the given engine
   * @param engineStyle  The database engine style (mssql, mysql, oracle, pg)
   * @param offset  The number of rows to skip (or undefined for none)
   * @private
   */
  _compileOFFSET(engineStyle: EngineStyle, offset?: number) {
    if (engineStyle === 'mssql') {
      // FETCH NEXT is only valid after an OFFSET clause
      return `OFFSET ${offset || 0} ROWS`;
    }
    if (!offset) {
      return undefined;
    }
    if (engineStyle === 'oracle') {
      return `OFFSET ${offset} ROWS`;
    }
    // mysql and pg
    return `OFFSET ${offset}`;
  }

  /**
   * Get SQL needed to return the found rows of this query
   * @param engineStyle  The database engine style (mssql, mysql, oracle, pg)
   * @param countExpr  The expression to use inside the COUNT()
   */
  compileCount({
    countExpr = '*',
    engine = defaultEngine,
    bindingIndex = 1,
  }: {
    countExpr?: string;
    engine?: EngineStyle;
    bindingIndex?: number;
  } = {}) {
    const query = this.getFoundRowsQuery(countExpr);
    const { sql, bindings } = query.compile({ engine, bindingIndex });
    if (!this._countNeedsSubquery()) {
      return { sql, bindings };
    }
    const subquerySql = sql.replace(/\n/g, '\n\t');
    return {
      sql: `SELECT COUNT(*) AS found_rows\nFROM (\n${subquerySql}\n) AS subquery_results`,
      bindings,
    };
  }

  /**
   * Whether counting this query's rows requires wrapping it in a subquery.
   * GROUP BY, HAVING and DISTINCT all change the number of rows,
   * so they can't be replaced by a simple COUNT() over the base tables.
   * DISTINCT may come from option('DISTINCT') or from parsed SQL, where the
   * parser leaves it at the start of the first column ("DISTINCT city").
   * This is the single source of truth for getFoundRowsQuery() and compileCount()
   * @private
   */
  _countNeedsSubquery() {
    return (
      this._groupBys.length > 0 ||
      this._havings.length > 0 ||
      this._options.some(option => distinctOptionRegex.test(option)) ||
      /^\s*DISTINCT(?:ROW)?\b/i.test(this._columns[0] || '')
    );
  }

  /**
   * Get SQL needed to union this query with another
   * @param query  The query to union
   * @param engine  The database engine style (mssql, mysql, oracle, pg)
   */
  compileUnion(
    query: SelectBuilder,
    {
      engine = defaultEngine,
      bindingIndex = 1,
    }: {
      engine?: EngineStyle;
      bindingIndex?: number;
    } = {}
  ) {
    const first = this.compile({ engine, bindingIndex });
    const second = query.compile({
      engine,
      bindingIndex: first.bindings.length + bindingIndex,
    });
    return {
      sql: `(${first.sql})\nUNION\n(${second.sql})`,
      bindings: [...first.bindings, ...second.bindings],
    };
  }

  /**
   * Reset some or all components of the query
   * @param  [fieldOrFields]  If given, reset the given component(s); otherwise
   *   reset all query components (including bindings)
   *   Valid components (singular or plural): option(s), select, column(s),
   *   table(s), join(s), where(s), having(s), groupBy(s), orderBy(s),
   *   limit, offset, page
   * @throws Error  If an unknown component name is given
   * @return This object
   */
  reset(fieldOrFields?: FieldName | FieldName[]) {
    if (Array.isArray(fieldOrFields)) {
      // validate every name before changing anything
      const props = fieldOrFields.map(getFieldProp);
      props.forEach(prop => this._resetProp(prop));
      return this;
    }
    if (fieldOrFields !== undefined && fieldOrFields !== null) {
      this._resetProp(getFieldProp(fieldOrFields));
    } else {
      this._options = [];
      this._columns = [];
      this._tables = [];
      this._joins = [];
      this._wheres = [];
      this._groupBys = [];
      this._havings = [];
      this._orderBys = [];
      this._limit = undefined;
      this._offset = undefined;
      this._page = undefined;
      this._bindings = [];
    }
    return this;
  }

  /**
   * Clear a single query component property
   * @param prop  The property to clear
   * @private
   */
  _resetProp(prop: ArrayFieldProp | ScalarFieldProp) {
    if (isScalarFieldProp(prop)) {
      this[prop] = undefined;
    } else {
      this[prop] = [];
    }
  }

  /**
   * Clone this builder object
   */
  getClone() {
    const copy = new SelectBuilder();
    copy._options = [...this._options];
    copy._columns = [...this._columns];
    copy._tables = [...this._tables];
    copy._joins = [...this._joins];
    copy._wheres = [...this._wheres];
    copy._havings = [...this._havings];
    copy._groupBys = [...this._groupBys];
    copy._orderBys = [...this._orderBys];
    copy._limit = this._limit;
    copy._offset = this._offset;
    copy._page = this._page;
    copy._bindings = [...this._bindings];
    return copy;
  }

  /**
   * Build a version of this query that simply returns COUNT(*).
   * If the query has GROUP BY, HAVING or a DISTINCT option, the result is
   * instead the un-paginated, unordered query (keeping only DISTINCT-type
   * options), which compileCount() wraps in
   * `SELECT COUNT(*) AS found_rows FROM (...) AS subquery_results`
   * @param [countExpr="*"]  Use to specify `DISTINCT colname` if needed
   *   (ignored when the query needs to be wrapped in a subquery)
   */
  getFoundRowsQuery(countExpr: string = '*') {
    const clone = this.getClone();
    clone._orderBys = [];
    clone._limit = undefined;
    clone._offset = undefined;
    clone._page = undefined;
    if (this._countNeedsSubquery()) {
      // Inside the derived table, keep only options that change which rows
      // are returned (DISTINCT, DISTINCTROW, DISTINCT ON (...)); others are
      // harmful there: SQL_CALC_FOUND_ROWS is a MySQL error in a subquery and
      // TOP n would cap the count at n
      clone._options = clone._options.filter(option =>
        distinctOptionRegex.test(option)
      );
    } else {
      clone._columns = [`COUNT(${countExpr}) AS found_rows`];
      clone._options = [];
    }
    return clone;
  }

  /**
   * Add an array of column names to fetch
   * @param columnNames  The names of columns
   */
  select(columnNames: string[]) {
    this._columns = this._columns.concat(columnNames);
    return this;
  }

  /**
   * Add an array of column names to fetch
   * @param columnNames  The names of columns
   */
  columns(columnNames: string[]) {
    this._columns = this._columns.concat(columnNames);
    return this;
  }

  /**
   * Add a column name to fetch
   * @param columnName  The name of the column
   */
  column(columnName: string) {
    this._columns.push(columnName);
    return this;
  }

  /**
   * Add an option expression such as "TOP 10" or "SQL_CALC_FOUND_ROWS"
   * @param optionExpression  Expression to go after "SELECT" and before column list
   */
  option(optionExpression: string) {
    this._options.push(optionExpression);
    return this;
  }

  /**
   * Add a table to the "FROM" clause (same as .from())
   * @param {String} tableName  The name of the table to query
   * @return {Select}
   */
  table(tableName: string) {
    this._tables.push(tableName);
    return this;
  }

  /**
   * Add multiple table to the "FROM" clause
   * @param {Array} tableNames  The names of the tables to query
   * @return {Select}
   */
  tables(tableNames: string[]) {
    this._tables.push(...tableNames);
    return this;
  }

  /**
   * Add a table to the "FROM" clause (same as .table())
   * @param {String} tableName  The name of the table to query
   * @return {Select}
   */
  from(tableName: string) {
    this._tables.push(tableName);
    return this;
  }

  /**
   * Push a value onto the bindings list and return its placeholder marker
   * @param value  The value to bind
   * @return  A marker like "__BOUND_3__" that compile() swaps for ?, $n, :n or @Pn
   * @private
   */
  _bind(value: any): string {
    this._bindings.push(value);
    return `__BOUND_${this._bindings.length - 1}__`;
  }

  /**
   * Add the given join type expression
   * @param joinType  The type of join (e.g. "INNER JOIN", "LEFT JOIN", etc.)
   * @param expression  The expression following the INNER JOIN keyword
   * @param bindings  A list of values to bind to ? placeholders in the expression.
   *   If non-empty, it must have exactly one value per "?" (else an Error is
   *   thrown). If empty, the expression is used as-is (so literal "?"
   *   operators such as Postgres jsonb "?|" are allowed).
   * @example
   *   query.join('posts p ON p.id = c.post_id');
   *   query.join('posts p ON p.id = c.post_id AND p.deleted_at < ?', [myDate]);
   */
  _addJoin(joinType: string, expression: string, bindings: any[] = []) {
    if (!Array.isArray(bindings)) {
      throw new Error(
        `SelectBuilder: ${joinType} bindings must be an array (got ${typeof bindings})`
      );
    }
    if (bindings.length > 0) {
      // An empty bindings array leaves the expression untouched so that
      // literal question marks (e.g. Postgres jsonb "?|") survive.
      const placeholderCount = substrCount(expression, '?');
      if (placeholderCount !== bindings.length) {
        throw new Error(
          `SelectBuilder: ${joinType} "${expression}" has ${placeholderCount} "?" placeholder(s) but ${bindings.length} binding(s) were given`
        );
      }
      bindings.forEach((v, idx) => {
        if (v === undefined) {
          throw new Error(
            `SelectBuilder: ${joinType} "${expression}" binding ${idx} is undefined; use null for NULL`
          );
        }
      });
      let i = 0;
      expression = expression.replace(/\?/g, () => this._bind(bindings[i++]));
    }
    this._joins.push(`${joinType} ${expression}`);
  }

  /**
   * Add a JOIN expression
   * @param expression  The expression following the INNER JOIN keyword
   * @param bindings  A list of values to bind to ? placeholders in the expression
   * @example
   *   query.join('posts p ON p.id = c.post_id');
   *   query.join('posts p ON p.id = c.post_id AND p.deleted_at < ?', [myDate]);
   */
  join(expression: string, bindings: any[] = []) {
    this._addJoin('JOIN', expression, bindings);
    return this;
  }

  /**
   * Add a LEFT JOIN expression
   * @param expression  The expression following the LEFT JOIN keyword
   * @param bindings  A list of values to bind to ? placeholders in the expression
   * @example
   *   query.leftJoin('posts p ON p.id = c.post_id');
   *   query.leftJoin('posts p ON p.id = c.post_id AND p.deleted_at < ?', [myDate]);
   */
  leftJoin(expression: string, bindings: any[] = []) {
    this._addJoin('LEFT JOIN', expression, bindings);
    return this;
  }

  /**
   * Add a FULL JOIN expression
   * @param expression  The expression following the FULL JOIN keyword
   * @param bindings  A list of values to bind to ? placeholders in the expression
   * @example
   *   query.fullJoin('posts p ON p.id = c.post_id');
   *   query.fullJoin('posts p ON p.id = c.post_id AND p.deleted_at < ?', [myDate]);
   */
  fullJoin(expression: string, bindings: any[] = []) {
    this._addJoin('FULL JOIN', expression, bindings);
    return this;
  }

  /**
   * Add a RIGHT JOIN expression
   * @param expression  The expression following the RIGHT JOIN keyword
   * @param bindings  A list of values to bind to ? placeholders in the expression
   * @example
   *   query.rightJoin('posts p ON p.id = c.post_id');
   *   query.rightJoin('posts p ON p.id = c.post_id AND p.deleted_at < ?', [myDate]);
   */
  rightJoin(expression: string, bindings: any[] = []) {
    this._addJoin('RIGHT JOIN', expression, bindings);
    return this;
  }

  /**
   * Add a CROSS JOIN expression
   * @param expression  The expression following the CROSS JOIN keyword
   * @param bindings  A list of values to bind to ? placeholders in the expression
   * @example
   *   query.crossJoin('posts p ON p.id = c.post_id');
   *   query.crossJoin('posts p ON p.id = c.post_id AND p.deleted_at < ?', [myDate]);
   */
  crossJoin(expression: string, bindings: any[] = []) {
    this._addJoin('CROSS JOIN', expression, bindings);
    return this;
  }

  /**
   * Add an INNER JOIN expression (same as ->join())
   * @param expression  The expression following the INNER JOIN keyword
   * @param bindings  A list of values to bind to ? placeholders in the expression
   * @example
   *   query.innerJoin('posts p ON p.id = c.post_id');
   *   query.innerJoin('posts p ON p.id = c.post_id AND p.deleted_at < ?', [myDate]);
   */
  innerJoin(expression: string, bindings: any[] = []) {
    this._addJoin('INNER JOIN', expression, bindings);
    return this;
  }

  /**
   * Add a LEFT OUTER JOIN expression
   * @param expression  The expression following the LEFT OUTER JOIN keyword
   * @param bindings  A list of values to bind to ? placeholders in the expression
   * @example
   *   query.leftOuterJoin('posts p ON p.id = c.post_id');
   *   query.leftOuterJoin('posts p ON p.id = c.post_id AND p.deleted_at < ?', [myDate]);
   */
  leftOuterJoin(expression: string, bindings: any[] = []) {
    this._addJoin('LEFT OUTER JOIN', expression, bindings);
    return this;
  }

  /**
   * Add a FULL OUTER JOIN expression
   * @param expression  The expression following the FULL OUTER JOIN keyword
   * @param bindings  A list of values to bind to ? placeholders in the expression
   * @example
   *   query.fullOuterJoin('posts p ON p.id = c.post_id');
   *   query.fullOuterJoin('posts p ON p.id = c.post_id AND p.deleted_at < ?', [myDate]);
   */
  fullOuterJoin(expression: string, bindings: any[] = []) {
    this._addJoin('FULL OUTER JOIN', expression, bindings);
    return this;
  }

  /**
   * Add a RIGHT OUTER JOIN expression
   * @param expression  The expression following the RIGHT OUTER JOIN keyword
   * @param bindings  A list of values to bind to ? placeholders in the expression
   * @example
   *   query.rightOuterJoin('posts p ON p.id = c.post_id');
   *   query.rightOuterJoin('posts p ON p.id = c.post_id AND p.deleted_at < ?', [myDate]);
   */
  rightOuterJoin(expression: string, bindings: any[] = []) {
    this._addJoin('RIGHT OUTER JOIN', expression, bindings);
    return this;
  }

  /**
   * Remove a join condition with the specified table
   * @param table  The name of the table or tables in the first part of the join
   *   statement, optionally with its alias (e.g. "permissions" or "permissions p").
   *   The name is matched literally (e.g. "schema.tbl" or "[dbo].[x]"); the
   *   JOIN keywords are matched case-insensitively.
   * @example
   *   query.unjoin('permissions'); // removes "LEFT JOIN permissions p ON ..."
   *   query.unjoin(['avatars', 'permissions p']);
   */
  unjoin(table: string | string[]) {
    if (Array.isArray(table)) {
      table.forEach(t => this.unjoin(t));
      return this;
    }
    const words = String(table).trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      return this;
    }
    // the name must be followed by whitespace or the end of the string
    // (\b would fail after a name ending in a non-word char like "]" or '"')
    const regex = new RegExp(
      `${joinPrefixSource}${words.map(escapeRegExp).join('\\s+')}(?=\\s|$)`
    );
    this._joins = this._joins.filter(join => !regex.test(join));
    return this;
  }

  /**
   * Utility function to add conditions for a clause (WHERE, HAVING)
   * @param  collection  The collection to add the clauses to (e.g. this._wheres or this._havings)
   * @param  criteria  Criteria adhering to WhereCriteria type
   * @example  The following are equivalent
   *   this._conditions(this._wheres, ['deleted_at IS NULL']);
   *   this._conditions(this._wheres, ['deleted_at', null]);
   *   this._conditions(this._wheres, ['deleted_at', '=', null]);
   *   this._conditions(this._wheres, ['deleted_at', 'IS', null]);
   * @example  More examples
   *   this._conditions(this._wheres, ['deleted_at', '!=', null]); // `deleted_at` IS NOT NULL (also <>, NOT and IS NOT)
   *   this._conditions(this._wheres, ['fname', 'LIKE', 'joe']); // `fname` LIKE 'joe'
   *   this._conditions(this._wheres, ['fname', 'LIKE ?', 'joe']); // `fname` LIKE 'joe'
   *   this._conditions(this._wheres, ['fname LIKE %?%', 'joe']); // `fname` LIKE '%joe%'
   *   this._conditions(this._wheres, ['fname LIKE ?%', 'joe']); // `fname` LIKE 'joe%'
   *   this._conditions(this._wheres, ['fname', 'LIKE ?%', 'joe']); // `fname` LIKE 'joe%'
   *   this._conditions(this._wheres, ['fname', 'LIKE ?%', 0]); // `fname` LIKE '0%'
   *   this._conditions(this._wheres, ['fname LIKE %?%', ['joe']]); // (`fname` LIKE '%joe%')
   *   this._conditions(this._wheres, ['fname LIKE %?%', ['joe', 'bob']]); // (`fname` LIKE '%joe%' OR `fname` LIKE '%bob%')
   *   this._conditions(this._wheres, ['fname', 'LIKE', []]); // (condition omitted)
   *   this._conditions(this._wheres, ['price >', 10]); // `price` > 10
   *   this._conditions(this._wheres, ['price', '>', 10]); // `price` > 10
   *   this._conditions(this._wheres, ['price =', 10]); // `price` = 10
   *   this._conditions(this._wheres, ['price !=', 10]); // `price` != 10
   *   this._conditions(this._wheres, ['price', 10]); // `price` = 10
   *   this._conditions(this._wheres, ['price', '=', 10]); // `price` = 10
   *   this._conditions(this._wheres, ['price', '!=', 10]); // `price` != 10
   *   this._conditions(this._wheres, ['price', 'BETWEEN', [10,20]]); // `price` BETWEEN 10 AND 20
   *   this._conditions(this._wheres, ['price', 'NOT BETWEEN', [10,20]]); // `price` NOT BETWEEN 10 AND 20
   *   this._conditions(this._wheres, ['price', [10,20]]); // `price` IN(10,20)
   *   this._conditions(this._wheres, ['price', '=', [10,20]]); // `price` IN(10,20)
   *   this._conditions(this._wheres, ['price', 'IN', [10,20]]); // `price` IN(10,20)
   *   this._conditions(this._wheres, ['price', 'NOT IN', [10,20]]); // `price` NOT IN(10,20)
   *   this._conditions(this._wheres, ['price', '!=', [10,20]]); // `price` NOT IN(10,20) (also <>)
   *   this._conditions(this._wheres, ['price', 'IN', []]); // (condition omitted)
   *   this._conditions(this._wheres, ['price', 'NOT IN', []]); // (condition omitted)
   *   this._conditions(this._wheres, ['SUBSTR(prefs, ?, ?) = role', [1, 4]]); // one value per "?"
   * @example  These throw an Error because they are ambiguous or nonsensical
   *   this._conditions(this._wheres, [null]); // criteria must be a string or object
   *   this._conditions(this._wheres, ['a = ? OR b = ?', [1]]); // 2 placeholders, 1 value
   *   this._conditions(this._wheres, ['price', '>', [10,20]]); // arrays need =, IN, !=, <> or NOT IN
   *   this._conditions(this._wheres, ['price', '>', null]); // null needs =, IS, !=, <>, NOT or IS NOT
   *   this._conditions(this._wheres, ['price', undefined]); // undefined is never bound (use null)
   *   this._conditions(this._wheres, ['price', [10, undefined]]); // undefined is never bound
   *   this._conditions(this._wheres, ['fname', 'LIKE ?%', null]); // LIKE values must not be null
   *   this._conditions(this._wheres, ['price', 'BETWEEN', 10]); // BETWEEN needs a 2-item array
   *   this._conditions(this._wheres, ['price', 'BETWEEN', [10, null]]); // use whereBetween() for open ranges
   */
  _conditions(collection: string[], criteria: WhereCriteria) {
    const numArgs = criteria.length;
    let [column, operator, value] = criteria;
    if (column !== null && typeof column === 'object') {
      if (Array.isArray(column)) {
        throw new Error(
          'SelectBuilder: a where()/having() condition must be a string or a plain object, not an array (use orWhere()/orHaving() for a list of conditions)'
        );
      }
      for (const keyValue of Object.entries(column)) {
        this._conditions(collection, keyValue);
      }
      return this;
    }
    if (typeof column !== 'string') {
      throw new Error(
        `SelectBuilder: a where()/having() condition must be a string or a plain object (got ${column === null ? 'null' : typeof column})`
      );
    }
    if (column.trim() === '') {
      if (numArgs === 1) {
        // nothing to add, e.g. where('') or a conditionally-built empty string
        return this;
      }
      throw new Error(
        'SelectBuilder: a where()/having() condition with a value must have a non-empty column or expression'
      );
    }
    if (numArgs === 1) {
      // condition is a stand-alone expression
      // e.g. "SUM(price) > 10"
      collection.push(column);
      return this;
    }
    if (numArgs === 2) {
      const parts = column.split(' ');
      const trailing = parts.slice(1).join(' ');
      // "name LIKE %?%" etc. always uses the column + operator form below,
      // even when the value is an array whose length matches the "?" count
      const isLikeInfix = likeInfixRegex.test(trailing);
      const placeholderCount = substrCount(column, '?');
      if (
        !Array.isArray(operator) &&
        !isLikeInfix &&
        placeholderCount > 0 &&
        !endsWithJsonbOperator(column)
      ) {
        // column is a string with a question mark and operator is a single
        // value to bind to it
        // e.g. query.having('COUNT(*) > ?', 2);
        // (but not a LIKE infix such as "name LIKE ?%" or a trailing jsonb
        // operator such as "tags ?", which use the column + operator form)
        if (placeholderCount !== 1) {
          throw new Error(
            `SelectBuilder: "${column}" has ${placeholderCount} "?" placeholder(s) but 1 value was given; pass an array with one value per "?"`
          );
        }
        if (operator === undefined) {
          throw new Error(
            `SelectBuilder: the value for "${column}" is undefined; use null for NULL`
          );
        }
        const value = operator;
        collection.push(column.replace('?', () => this._bind(value)));
        return this;
      }
      if (
        Array.isArray(operator) &&
        !isLikeInfix &&
        (placeholderCount > 0 ||
          (operator.length === 0 && isStandaloneExpression(column)))
      ) {
        // column is a string with question marks and operator is an array of replacements
        // e.g. query.where('SUBSTR(prefs, ?, ?) = role', [1, 4]);
        // or a stand-alone expression with no placeholders
        // e.g. query.where('mobile_id IN (SELECT id FROM phone)', []);
        // (but not a bare column with an empty array, e.g. query.where('id', []))
        const values = operator;
        if (placeholderCount !== values.length) {
          throw new Error(
            `SelectBuilder: "${column}" has ${placeholderCount} "?" placeholder(s) but ${values.length} value(s) were given`
          );
        }
        values.forEach((v, idx) => {
          if (v === undefined) {
            throw new Error(
              `SelectBuilder: value ${idx} for "${column}" is undefined; use null for NULL`
            );
          }
        });
        let i = 0;
        const sql = column.replace(/\?/g, () => this._bind(values[i++]));
        collection.push(sql);
        return this;
      }
      // condition has pairs of "column + operator" => "value"
      // e.g. ["price >", 10]
      // e.g. ["status LIKE ?%", 10]
      value = operator;
      column = parts[0];
      operator = trailing;
    }
    if (typeof operator !== 'string' || operator === '') {
      operator = '=';
    }
    // toUpperCase(), not toLocaleUpperCase(): in a Turkish locale "in" would
    // become "İN"
    operator = operator.toUpperCase();
    if (value === undefined) {
      throw new Error(
        `SelectBuilder: the value for "${column} ${operator}" is undefined; use null to compare against NULL`
      );
    }
    const likeMatch = operator.match(
      /^(LIKE|NOT LIKE|ILIKE|NOT ILIKE)(?: (\?|\?%|%\?|%\?%))?$/
    );
    if (operator === 'NOT BETWEEN' || operator === 'BETWEEN') {
      if (!Array.isArray(value) || value.length !== 2) {
        throw new Error(
          `SelectBuilder: ${operator} for "${column}" requires an array of exactly 2 values`
        );
      }
      if (isNullOrUndefined(value[0]) || isNullOrUndefined(value[1])) {
        throw new Error(
          `SelectBuilder: ${operator} for "${column}" received a null or undefined bound; use whereBetween() for an open-ended range`
        );
      }
      collection.push(
        `${column} ${operator} ${this._bind(value[0])} AND ${this._bind(value[1])}`
      );
    } else if (likeMatch) {
      const like = likeMatch[1]; // Either "LIKE", "NOT LIKE" etc.
      const infix = likeMatch[2] || '?'; // ONE OF ?% or %?% or %? or ?
      const likeValues: any[] = Array.isArray(value) ? value : [value];
      if (likeValues.length === 0) {
        // "()" is invalid SQL, so omit the condition entirely (like empty IN)
        return this;
      }
      likeValues.forEach(v => {
        if (isNullOrUndefined(v)) {
          throw new Error(
            `SelectBuilder: ${like} value for "${column}" must not be ${v}; use where("${column}", null) to test for NULL`
          );
        }
      });
      const ors = likeValues.map(v => {
        // use a function replacer so "$&" etc. in v are not treated as patterns
        return `${column} ${like} ${this._bind(infix.replace('?', () => String(v)))}`;
      });
      collection.push(Array.isArray(value) ? `(${ors.join(' OR ')})` : ors[0]);
    } else if (value === null) {
      if (operator === '=' || operator === 'IS') {
        collection.push(`${column} IS NULL`);
      } else if (
        operator === '!=' ||
        operator === '<>' ||
        operator === 'IS NOT' ||
        operator === 'NOT'
      ) {
        collection.push(`${column} IS NOT NULL`);
      } else {
        throw new Error(
          `SelectBuilder: cannot compare "${column}" to null with operator "${operator}"; use =, IS, !=, <>, NOT or IS NOT`
        );
      }
    } else if (Array.isArray(value)) {
      // an array of values should be IN or NOT IN
      let inOperator: string;
      if (operator === '=' || operator === 'IN') {
        inOperator = 'IN';
      } else if (
        operator === '!=' ||
        operator === '<>' ||
        operator === 'NOT IN'
      ) {
        inOperator = 'NOT IN';
      } else {
        throw new Error(
          `SelectBuilder: operator "${operator}" for "${column}" cannot take an array value; use =, IN, !=, <> or NOT IN`
        );
      }
      if (value.length === 0) {
        // "IN()" is invalid SQL, so omit the condition entirely
        return this;
      }
      value.forEach((v: any, idx: number) => {
        if (v === undefined) {
          throw new Error(
            `SelectBuilder: ${inOperator} value ${idx} for "${column}" is undefined; use null for NULL`
          );
        }
      });
      const inVals = value.map((v: any) => this._bind(v));
      collection.push(`${column} ${inOperator}(${inVals.join(', ')})`);
    } else if (operator === 'IN' || operator === 'NOT IN') {
      // in clause that is not array
      collection.push(`${column} ${operator}(${this._bind(value)})`);
    } else {
      collection.push(`${column} ${operator} ${this._bind(value)}`);
    }
    return this;
  }

  /**
   * Add a group by column or expression
   * @param column  The name of a column (or expression) to group by
   */
  groupBy(column: string) {
    this._groupBys.push(column);
    return this;
  }

  /**
   * Add WHERE clauses to conditions (See _conditions for usage)
   */
  where(...args: WhereCriteria) {
    this._conditions(this._wheres, args);
    return this;
  }

  /**
   * Add a WHERE clause with a BETWEEN condition
   * @param column  The column name
   * @param twoValueArray  The two values to be between. If the first is null, it will use >= instead. If the second is null, it will use <= instead. If both are null, no criteria will be added
   */
  whereBetween(column: string, twoValueArray: [any, any]) {
    if (!isNullish(twoValueArray[0]) && !isNullish(twoValueArray[1])) {
      this.where(column, 'BETWEEN', twoValueArray);
    } else if (!isNullish(twoValueArray[0]) && isNullish(twoValueArray[1])) {
      this.where(column, '>=', twoValueArray[0]);
    } else if (isNullish(twoValueArray[0]) && !isNullish(twoValueArray[1])) {
      this.where(column, '<=', twoValueArray[1]);
    } else {
      // both are nullish! omit expression
    }
    return this;
  }

  /**
   * Build a parenthesized group of conditions joined by OR
   * (See _conditions for usage)
   * - An array: each item is one OR operand. Array items are where()-style
   *   criteria, strings are stand-alone expressions, and objects are AND
   *   groups (e.g. [{ a: 1, b: 2 }, { c: 3 }] => "((a = ? AND b = ?) OR c = ?)")
   * - A plain object: each key/value pair is one OR operand
   *   (e.g. { a: 1, b: 2 } => "(a = ? OR b = ?)")
   * @param conditions
   * @return  The parenthesized OR group, or an empty string if every
   *   condition was omitted (e.g. empty IN arrays)
   */
  _orConditions(
    conditions: WhereCriteria[] | Record<string, any>[] | Record<string, any>
  ) {
    if (conditions === null || typeof conditions !== 'object') {
      throw new Error(
        `SelectBuilder: orWhere()/orHaving() expects an array or a plain object (got ${conditions === null ? 'null' : typeof conditions})`
      );
    }
    const items: string[] = [];
    if (Array.isArray(conditions)) {
      for (const condition of conditions) {
        if (Array.isArray(condition)) {
          this._conditions(items, condition as WhereCriteria);
        } else if (condition !== null && typeof condition === 'object') {
          // each object is a group of conditions joined by AND
          const group: string[] = [];
          this._conditions(group, [condition]);
          if (group.length === 1) {
            items.push(group[0]);
          } else if (group.length > 1) {
            // parenthesize any member that could contain a looser-binding
            // operator so it can't escape the AND group
            const ands = group.map(sql =>
              /\bX?OR\b|\|\|/i.test(sql) ? wrapInParens(sql) : sql
            );
            items.push(`(${ands.join(' AND ')})`);
          }
        } else {
          this._conditions(items, [condition]);
        }
      }
    } else {
      for (const [key, value] of Object.entries(conditions)) {
        this._conditions(items, [key, value]);
      }
    }
    if (items.length === 0) {
      return '';
    }
    // Always enclose the whole OR group in parentheses so that it can't
    // combine with neighboring AND conditions. Only skip adding them when the
    // joined result is provably one fully-parenthesized group already.
    return wrapInParens(items.join(' OR '));
  }

  /**
   * Add WHERE conditions to place inside an OR block (See _conditions for usage)
   * @param conditions  A list or object where each item is an array with parameters that would be taken by where()
   */
  orWhere(
    conditions: WhereCriteria[] | Record<string, any>[] | Record<string, any>
  ) {
    const group = this._orConditions(conditions);
    if (group !== '') {
      this.where(group);
    }
    return this;
  }

  /**
   * Add an OR with conditions under the HAVING clause
   * @param conditions  A list or object where each item is an array with parameters that would be taken by having()
   */
  orHaving(
    conditions: WhereCriteria[] | Record<string, any>[] | Record<string, any>
  ) {
    const group = this._orConditions(conditions);
    if (group !== '') {
      this.having(group);
    }
    return this;
  }

  /**
   * Add a HAVING condition (See _conditions for usage)
   */
  having(...args: WhereCriteria) {
    this._conditions(this._havings, args);
    return this;
  }

  /**
   * Add a column or expression to order by
   * @param column  The column name or expression to sort by. Include DESC or prefix with - to sort descending
   * @param [direction]  The direction to sort by (ASC or DESC)
   * @example
   *   query.orderBy('modified_at'); // ORDER BY modified_at
   *   query.orderBy('-modified_at'); // ORDER BY modified_at DESC
   *   query.orderBy('COUNT(*)'); // ORDER BY COUNT(*)
   *   query.orderBy('COUNT(*) DESC'); // ORDER BY COUNT(*) DESC
   *   query.orderBy('modified_at DESC NULLS LAST'); // ORDER BY modified_at DESC NULLS LAST
   *   query.orderBy('modified_at USING >'); // ORDER BY modified_at USING >
   */
  orderBy(column: string, direction?: 'ASC' | 'DESC') {
    if (direction) {
      this._orderBys.push(`${column} ${direction}`);
    } else {
      const expression = column.replace(/^-(.+)/, '$1 DESC');
      this._orderBys.push(expression);
    }
    return this;
  }

  /**
   * Sort by the given field, with a map of allowed fields to column expressions.
   * Only field names present in mapNames are allowed; anything else emits a
   * console.warn and adds no ORDER BY clause. This prevents SQL injection when
   * fieldName comes from user input.
   * @param fieldName  The field name such as 'created' or '-created' for descending
   * @param mapNames  Allowed field names mapped to column expressions
   * @param [modifier]  Additional clause to append such as 'NULLS LAST' or 'COLLATE "en_US"'
   * @example
   *   query.sortField('-created', {'created': 'created_at'}); // ORDER BY created_at DESC
   *   query.sortField('-foo', {'created': 'created_at'}); // console.warn; no ORDER BY added
   *   query.sortField('-created', {
   *     'created': 'created_at NULLS LAST',
   *     '-created': 'created_at DESC NULLS LAST'
   *   }); // ORDER BY created_at DESC NULLS LAST
   *   query.sortField('-name', {
   *     'name': 'name COLLATE "jp_JP"'
   *   }); // ORDER BY name COLLATE "jp_JP" DESC
   */
  sortField(
    fieldName: any,
    mapNames: Record<string, string> = {},
    modifier = ''
  ) {
    if (typeof fieldName !== 'string' || fieldName === '') {
      return this;
    }
    let direction = 'ASC' as 'ASC' | 'DESC';
    if (fieldName.startsWith('-')) {
      if (mapNames[fieldName]) {
        // map contains special case for descending
        const maybeModifier = modifier ? ` ${modifier}` : '';
        this.orderBy(mapNames[fieldName] + maybeModifier);
        return this;
      }
      // no special case: use DESC
      direction = 'DESC';
      fieldName = fieldName.slice(1);
    }
    if (!Object.prototype.hasOwnProperty.call(mapNames, fieldName)) {
      console.warn(
        `SelectBuilder: sortField() ignoring unknown field "${fieldName.slice(0, 100)}"`
      );
      return this;
    }
    const column = mapNames[fieldName];
    if (modifier) {
      direction += ` ${modifier}`;
    }
    this.orderBy(column, direction!);
    return this;
  }

  /**
   * Check to see if the given string is 0 or all digits not starting with 0
   * @param string  The input string
   * @private
   */
  _isEntirelyDigits(string: string) {
    return /^(0|[1-9]\d*)$/.test(string);
  }

  /**
   * Check to see if the given string is all digits not starting with 0
   * @param string  The input string
   * @private
   */
  _isEntirelyDigitsNoZeros(string: string) {
    return /^[1-9]\d*$/.test(string);
  }

  /**
   * Limit results to the given number
   * @param max  The number to limit by (integer greater than 0, or a string of digits)
   * @throws Error  If max is not a positive integer or a string of one
   */
  limit(max: number | string) {
    if (typeof max === 'string' && this._isEntirelyDigitsNoZeros(max.trim())) {
      // is entirely digits (no leading zeros)
      this._limit = parseInt(max, 10);
    } else if (typeof max === 'number' && Number.isInteger(max) && max >= 1) {
      this._limit = max;
    } else {
      throw new Error(
        `SelectBuilder: "limit(n)" must receive a positive integer (got "${max}")`
      );
    }
    return this;
  }

  /**
   * Fetch results from the given offset
   * @param number  The offset (integer greater than or equal to 0, or a string of digits)
   * @throws Error  If number is not a non-negative integer or a string of one
   */
  offset(number: number | string) {
    if (typeof number === 'string' && this._isEntirelyDigits(number.trim())) {
      // is zero or entirely digits (no leading zeros)
      this._offset = parseInt(number, 10);
    } else if (
      typeof number === 'number' &&
      Number.isInteger(number) &&
      number >= 0
    ) {
      this._offset = number;
    } else {
      throw new Error(
        `SelectBuilder: "offset(n)" must receive a non-negative integer (got "${number}")`
      );
    }
    return this;
  }

  /**
   * Set the offset based on the limit with the given page number
   * @param number  The page number (integer greater than 0)
   */
  page(number: number | string) {
    if (
      typeof number === 'string' &&
      this._isEntirelyDigitsNoZeros(number.trim())
    ) {
      // is entirely digits (no leading zeros, so never zero)
      this._page = parseInt(number, 10);
    } else if (
      typeof number === 'number' &&
      Number.isInteger(number) &&
      number >= 1
    ) {
      this._page = number;
    } else {
      throw new Error(
        'SelectBuilder: "page(n)" must receive a positive integer'
      );
    }
    return this;
  }
}
