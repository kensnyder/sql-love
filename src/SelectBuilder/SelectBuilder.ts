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
  | [string, string, any]
  | [string, any]
  | [string]
  | [Record<string, any>];

const isNullish = v => v === undefined || v === null || v === false || isNaN(v);

/**
 * Build a select query
 * Class Select
 */
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
   * The list of column names to select
   * @private
   */
  _tables: string[] = [];
  /**
   * The list of tables in the FROM clause
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
  _limit: number;
  /**
   * The OFFSET to use
   * @private
   */
  _offset: number;
  /**
   * The page used to construct an OFFSET based on the LIMIT
   * @private
   */
  _page: number;

  /**
   * Select constructor
   * @param [sql]  A base SQL query to parse
   * @param [bindings]  Placeholders to bind to the query
   */
  constructor(sql: string = null, bindings: Record<string, any> = null) {
    if (sql) {
      if (bindings) {
        const keys = Object.keys(bindings);
        const regexp = new RegExp(`:(${keys.join('|')})`, 'g');
        sql = sql.replace(regexp, ($0, $1) => {
          this._bindings.push(bindings[$1]);
          return `__BOUND_${this._bindings.length - 1}__`;
        });
      }
      new Parser(this).parse(sql);
    }
  }

  /**
   * Get the SQL as a pretty-printed string alongside an array of bindings
   * @param engineStyle  The database engine style (mssql, mysql, oracle, pg)
   * @return The SQL query as a string
   */
  compile(engineStyle: EngineStyle = 'mysql') {
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
    if (this._page > 0) {
      const offset = (this._page - 1) * this._limit;
      lines.push(this._compileOFFSET(engineStyle, offset));
      lines.push(this._compileLIMIT(engineStyle, this._limit));
    } else {
      if (this._offset) {
        lines.push(this._compileOFFSET(engineStyle, this._offset));
      }
      if (this._limit) {
        lines.push(this._compileLIMIT(engineStyle, this._limit));
      }
    }

    const pretty = lines.filter(Boolean).join('\n').trim();
    let replacer: (match0: string, match1: string) => string;
    const bindings: any = [];
    if (engineStyle === 'pg') {
      let idx = 1;
      replacer = ($0, $1) => {
        bindings.push(this._bindings[$1]);
        return '$' + idx++;
      };
    } else {
      replacer = ($0, $1) => {
        bindings.push(this._bindings[$1]);
        return '?';
      };
    }
    const sql = pretty.replace(/__BOUND_(\d+)__/g, replacer);
    return { sql, bindings };
  }

  _compileLIMIT(engineStyle: EngineStyle, limit: number) {
    if (engineStyle === 'pg' || engineStyle === 'mysql') {
      return `LIMIT ${limit}`;
    } else if (engineStyle === 'mssql') {
      return `FETCH NEXT ${limit} ROWS ONLY`;
    }
  }

  _compileOFFSET(engineStyle: EngineStyle, offset: number) {
    if (engineStyle === 'pg' || engineStyle === 'mysql') {
      return `OFFSET ${offset}`;
    } else if (engineStyle === 'mssql' || engineStyle === 'oracle') {
      return `OFFSET ${offset} ROWS`;
    }
  }

  /**
   * Get SQL needed to return the found rows of this query
   * @param engineStyle  The database engine style (mssql, mysql, oracle, pg)
   * @param countExpr  The expression to use inside the COUNT()
   */
  compileCount(engineStyle: EngineStyle = 'mysql', countExpr: string = '*') {
    const query = this.getFoundRowsQuery(countExpr);
    const { sql, bindings } = query.compile(engineStyle);
    if (this._havings.length === 0) {
      return { sql, bindings };
    } else {
      const subquerySql = sql.replace(/\n/g, '\n\t');
      return {
        sql: `SELECT COUNT(*) AS found_rows\nFROM (\n${subquerySql}\n) AS subquery_results`,
        bindings,
      };
    }
  }

  /**
   * @param  [fieldOrFields]  If given, reset the given component(s), otherwise reset all query components
   *   Valid components: option, column, table, where, orWhere, having, groupBy, orderBy, limit, offset, page
   * @return This object
   */
  reset(fieldOrFields: FieldName | FieldName[] = null) {
    if (Array.isArray(fieldOrFields)) {
      fieldOrFields.forEach(name => this.reset(name));
      return this;
    }
    if (fieldOrFields) {
      const pluralizable = [
        'option',
        'column',
        'table',
        'where',
        'having',
        'groupBy',
        'orderBy',
      ];
      let prop = '_' + fieldOrFields.replace(/s$/, '');
      if (pluralizable.indexOf(fieldOrFields) > -1) {
        prop += 's';
      }
      const isScalar = ['limit', 'offset', 'page'].indexOf(fieldOrFields) > -1;
      this[prop] = isScalar ? null : [];
    } else {
      this._options = [];
      this._columns = [];
      this._tables = [];
      this._joins = [];
      this._wheres = [];
      this._groupBys = [];
      this._havings = [];
      this._orderBys = [];
      this._limit = null;
      this._offset = null;
      this._page = null;
      this._bindings = [];
    }
    return this;
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
   * Build a version of this query that simply returns COUNT(*)
   * @param [countExpr="*"]  Use to specify `DISTINCT colname` if needed
   */
  getFoundRowsQuery(countExpr: string = '*') {
    if (this._havings.length === 0) {
      const clone = this.getClone();
      clone._columns = [`COUNT(${countExpr}) AS found_rows`];
      clone._options = [];
      clone._groupBys = [];
      clone._orderBys = [];
      clone._limit = null;
      clone._offset = null;
      clone._page = null;
      return clone;
    } else {
      const subquery = this.getClone();
      subquery._limit = null;
      subquery._offset = null;
      subquery._page = null;
      return subquery;
    }
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
   * Add the given join type expression
   * @param joinType  The type of join (e.g. "INNER JOIN", "LEFT JOIN", etc.)
   * @param expression  The expression following the INNER JOIN keyword
   * @param bindings  A list of values to bind to ? placeholders in the expression
   * @example
   *   query.join('posts p ON p.id = c.post_id');
   *   query.join('posts p ON p.id = c.post_id AND p.deleted_at < ?', [myDate]);
   */
  _addJoin(joinType: string, expression: string, bindings: any[] = []) {
    if (bindings.length > 0) {
      expression = expression.replace(/\?/g, () => {
        this._bindings.push(bindings.shift());
        return `__BOUND_${this._bindings.length - 1}__`;
      });
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
   * @param table  The name of the table or tables in the first part of the join statement
   */
  unjoin(table: string | string[]) {
    if (Array.isArray(table)) {
      table.forEach(t => this.unjoin(t));
      return this;
    }
    this._joins = this._joins.filter(join => {
      const regex = new RegExp(`JOIN ${table}\\b`);
      return !regex.test(join);
    });
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
   * @example  More examples
   *   this._conditions(this._wheres, ['fname', 'LIKE', 'joe']); // `fname` LIKE 'joe'
   *   this._conditions(this._wheres, ['fname', 'LIKE ?', 'joe']); // `fname` LIKE 'joe'
   *   this._conditions(this._wheres, ['fname LIKE %?%', 'joe']); // `fname` LIKE '%joe%'
   *   this._conditions(this._wheres, ['fname LIKE ?%', 'joe']); // `fname` LIKE 'joe%'
   *   this._conditions(this._wheres, ['fname', 'LIKE ?%', 'joe']); // `fname` LIKE 'joe%'
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
   */
  _conditions(collection: string[], criteria: WhereCriteria) {
    const numArgs = criteria.length;
    let [column, operator, value] = criteria;
    if (typeof column === 'object') {
      for (const keyValue of Object.entries(column)) {
        this._conditions(collection, keyValue);
      }
      return this;
    }
    if (numArgs === 1) {
      // condition is a stand-alone expression
      // e.g. "SUM(price) > 10"
      collection.push(column);
      return this;
    } else if (
      numArgs === 2 &&
      Array.isArray(operator) &&
      operator.length > 0 &&
      substrCount(column, '?') === operator.length
    ) {
      // column is a string with question marks and operator is an array of replacements
      // e.g. query.where('SUBSTR(prefs, ?, ?) = role', [1, 4]);
      const values = operator;
      const sql = column.replace(/\?/g, () => {
        this._bindings.push(values.shift());
        return `__BOUND_${this._bindings.length - 1}__`;
      });
      collection.push(sql);
      return this;
    } else if (numArgs === 2) {
      // condition has pairs of "column + operator" => "value"
      // e.g. ["price >", 10]
      // e.g. ["status LIKE ?%", 10]
      value = operator;
      const parts = column.split(' ');
      column = parts.shift();
      operator = parts.join(' ');
    }
    if (typeof operator !== 'string' || operator === '') {
      operator = '=';
    }
    operator = operator.toLocaleUpperCase();
    const likeMatch = operator.match(
      /^(LIKE|NOT LIKE|ILIKE|NOT ILIKE)(?: (\?|\?%|%\?|%\?%))?$/i
    );
    if (operator === 'NOT BETWEEN' || operator === 'BETWEEN') {
      // expect a two-item array
      const one = this._bindings.length;
      const two = this._bindings.length + 1;
      collection.push(
        `${column} ${operator} __BOUND_${one}__ AND __BOUND_${two}__`
      );
      this._bindings.push(value[0], value[1]);
    } else if (likeMatch) {
      const like = likeMatch[1].toUpperCase(); // Either "LIKE", "NOT LIKE" etc.
      const infix = likeMatch[2] || '?'; // ONE OF ?% or %?% or %? or ?
      if (Array.isArray(value)) {
        const ors = [];
        for (const v of value) {
          ors.push(`${column} ${like} __BOUND_${this._bindings.length}__`);
          this._bindings.push(infix.replace('?', v));
        }
        const joined = ors.join(' OR ');
        collection.push(`(${joined})`);
      } else {
        collection.push(`${column} ${like} __BOUND_${this._bindings.length}__`);
        this._bindings.push(infix.replace('?', value || ''));
      }
    } else if (value === null) {
      collection.push(
        operator === '=' ? `${column} IS NULL` : `${column} IS NOT NULL`
      );
    } else if (Array.isArray(value)) {
      // an array of values should be IN or NOT IN
      const inVals = [];
      for (let i = 0; i < value.length; i++) {
        inVals.push(`__BOUND_${this._bindings.length}__`);
        this._bindings.push(value[i]);
      }
      const joined = inVals.join(', ');
      collection.push(
        operator === '=' || operator === 'IN'
          ? `${column} IN(${joined})`
          : `${column} NOT IN(${joined})`
      );
    } else if (operator === 'IN' || operator === 'NOT IN') {
      // in clause that is not array
      collection.push(
        `${column} ${operator}(__BOUND_${this._bindings.length}__)`
      );
      this._bindings.push(value);
    } else {
      collection.push(
        `${column} ${operator} __BOUND_${this._bindings.length}__`
      );
      this._bindings.push(value);
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
   * @param twoValueArray  The two values to be between
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
   * Add a series of WHERE clauses joined by OR (See _conditions for usage)
   * @param conditions
   */
  _orConditions(conditions: WhereCriteria[] | Record<string, any>[]) {
    const items = [];
    for (const condition of conditions) {
      if (Array.isArray(condition)) {
        this._conditions(items, condition as WhereCriteria);
      } else {
        this._conditions(items, [condition]);
      }
    }
    const joined = items.join(' OR ');
    if (joined.startsWith('(') && joined.endsWith(')')) {
      // start/end paraens will be added by orWhere() or orHaving()
      return joined.slice(1, -1);
    } else {
      return joined;
    }
  }

  /**
   * Add WHERE conditions to place inside an OR block (See _conditions for usage)
   * @param conditions  A list or object where each item is an array with parameters that would be taken by where()
   */
  orWhere(conditions: WhereCriteria[] | Record<string, any>[]) {
    const joined = this._orConditions(conditions);
    this.where(`(${joined})`);
    return this;
  }

  /**
   * Add an OR with conditions under the HAVING clause
   * @param conditions  A list or object where each item is an array with parameters that would be taken by having()
   */
  orHaving(conditions: WhereCriteria[] | Record<string, any>[]) {
    const joined = this._orConditions(conditions);
    this.having(`(${joined})`);
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
   *   query.sortField('modified_at'); // ORDER BY modified_at
   *   query.sortField('-modified_at'); // ORDER BY modified_at DESC
   *   query.sortField('COUNT(*)'); // ORDER BY COUNT(*)
   *   query.sortField('COUNT(*) DESC'); // ORDER BY COUNT(*) DESC
   */
  orderBy(column: string, direction: 'ASC' | 'DESC' = null) {
    if (direction) {
      this._orderBys.push(`${column} ${direction}`);
    } else {
      const expression = column.replace(/^-(.+)/, '$1 DESC');
      this._orderBys.push(expression);
    }
    return this;
  }

  /**
   * Sort by the given column, with a map of columns to translate
   * @param column  The column name such as "created_at" or "-created_at" for descending
   * @param [mapNames]  Column names to translate from one name to another
   * @example
   *   query.sortField('-modified_at'); // ORDER BY modified_at DESC
   *   query.sortField('created_at', {'created_at': 'created'}); // ORDER BY created
   */
  sortField(column: string, mapNames: Record<string, string> = {}) {
    column.replace(/^-(.+)/, '$1 DESC');
    column = mapNames[column] || column;
    this.orderBy(column);
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
   * Check to see if the given string is all digits
   * @param string  The input string
   * @private
   */
  _isEntirelyDigitsNoZeros(string: string) {
    return /^[1-9]\d*$/.test(string);
  }

  /**
   * Limit results to the given number
   * @param max  The number to limit by (placeholder string or integer greater than 0)
   */
  limit(max: number | string) {
    if (typeof max === 'string') {
      max = max.trim();
      if (this._isEntirelyDigitsNoZeros(max)) {
        // is entirely digits (no leading zeros)
        this._limit = parseInt(max, 10);
      }
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
   * @param number  The offset (placeholder string or integer greater than or equal to 0)
   */
  offset(number: number | string) {
    if (typeof number === 'string' && this._isEntirelyDigits(number.trim())) {
      // is entirely digits (or zero)
      this._offset = parseInt(number, 10);
    } else if (
      typeof number === 'number' &&
      Number.isInteger(number) &&
      number >= 0
    ) {
      this._offset = number;
    } else {
      throw new Error(
        `SelectBuilder: "offset(n)" must receive a positive integer (got "${number}")`
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
      // is entirely digits (or zero)
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

  fetch(engine) {
    if (engine.$queryRawUnsafe) {
      //
    }
  }
}
