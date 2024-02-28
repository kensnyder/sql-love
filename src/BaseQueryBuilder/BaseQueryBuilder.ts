import {
  WhereCriteria,
  buildConditions,
} from '../buildConditions/buildConditions';
import { EngineStyle } from '../defaultEngine/defaultEngine';

/**
 * Base class for building SELECT, UPDATE, and DELETE queries
 * Class Select
 */
export default class BaseQueryBuilder {
  _arrayFields: string[];
  _scalarFields: string[];
  /**
   * The list of values to bind to the query
   * @private
   */
  _bindings: any[] = [];
  /**
   * The list of strings to come immediately after "UPDATE"
   * and before the table name. (e.g. "LOW_PRIORITY" or "IGNORE")
   * @private
   */
  _options: string[] = [];
  /**
   * The list of tables in the FROM clause
   * @private
   */
  _tables: string[] = [];
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

  _compilePaginationToLines(lines: string[], engine: EngineStyle) {
    if (this._page > 0) {
      const offset = (this._page - 1) * this._limit;
      lines.push(this._compileOFFSET(engine, offset));
      lines.push(this._compileLIMIT(engine, this._limit));
    } else {
      if (this._offset) {
        lines.push(this._compileOFFSET(engine, this._offset));
      }
      if (this._limit) {
        lines.push(this._compileLIMIT(engine, this._limit));
      }
    }
  }

  _compileLIMIT(engineStyle: EngineStyle, limit: number) {
    if (
      engineStyle === 'pg' ||
      engineStyle === 'mysql' ||
      engineStyle === 'sqlite'
    ) {
      return `LIMIT ${limit}`;
    } else if (engineStyle === 'mssql' || engineStyle === 'oracle') {
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
   * @param  [fieldOrFields]  If given, reset the given component(s), otherwise reset all query components
   *   Valid components: option, column, table, where, orWhere, having, groupBy, orderBy, limit, offset, page
   * @return This object
   */
  reset(fieldOrFields: string | string[] = null) {
    if (Array.isArray(fieldOrFields)) {
      fieldOrFields.forEach(name => this.reset(name));
      return this;
    }
    if (fieldOrFields) {
      const isArray = this._arrayFields.includes(fieldOrFields);
      const isScalar = this._scalarFields.includes(fieldOrFields);
      const isKnown = isArray || isScalar;
      if (!isKnown) {
        throw new Error('Cannot reset unknown field name: ' + fieldOrFields);
      }
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
      this[prop] = isScalar ? null : [];
    } else {
      this.reset(this._arrayFields);
      this.reset(this._scalarFields);
    }
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
   */
  table(tableName: string) {
    this._tables.push(tableName);
    return this;
  }

  /**
   * Add multiple table to the "FROM" clause
   * @param {Array} tableNames  The names of the tables to query
   */
  tables(tableNames: string[]) {
    this._tables.push(...tableNames);
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
   * Add WHERE clauses to conditions (See _conditions for usage)
   */
  where(...args: WhereCriteria) {
    buildConditions(this._wheres, this._bindings, args);
    return this;
  }

  /**
   * Add a WHERE clause with a BETWEEN condition
   * @param column  The column name
   * @param twoValueArray  The two values to be between
   */
  whereBetween(column: string, twoValueArray: [any, any]) {
    const isNullish = v =>
      v === undefined || v === null || v === false || isNaN(v);
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
   * Add a series of WHERE clauses joined by OR (See buildConditions for usage)
   * @param conditions
   */
  _orConditions(
    conditions: WhereCriteria[] | Record<string, any>[] | Record<string, any>
  ) {
    const items = [];
    if (Array.isArray(conditions)) {
      for (const condition of conditions) {
        if (Array.isArray(condition)) {
          buildConditions(items, this._bindings, condition as WhereCriteria);
        } else {
          buildConditions(items, this._bindings, [condition]);
        }
      }
    } else {
      for (const [key, value] of Object.entries(conditions)) {
        const one = [];
        buildConditions(one, this._bindings, [key, value]);
        items.push(one[0]);
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
  orWhere(
    conditions: WhereCriteria[] | Record<string, any>[] | Record<string, any>
  ) {
    const joined = this._orConditions(conditions);
    this.where(`(${joined})`);
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
   * @param fieldName  The file name such as "created_at" or "-created_at" for descending
   * @param [mapNames]  Column names to translate from field to column expression
   * @example
   *   query.sortField('-modified_at'); // ORDER BY modified_at DESC
   *   query.sortField('-created', {'created': 'created_at'}); // ORDER BY created_at DESC
   */
  sortField(fieldName: string, mapNames: Record<string, string> = {}) {
    let direction = 'ASC' as 'ASC' | 'DESC';
    if (fieldName.startsWith('-')) {
      direction = 'DESC';
      fieldName = fieldName.slice(1);
    }
    const column = mapNames[fieldName] || fieldName;
    this.orderBy(column, direction);
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
}
