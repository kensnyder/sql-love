import type Select from '../SelectBuilder/SelectBuilder';

/**
 * Parse SQL and populate onto a Select query object
 */
export default class Parser {
  query: Select;

  /**
   * Create a new instance
   * @param query  A Select object on which to build parsed conditions
   */
  constructor(query: Select) {
    this.query = query;
  }

  /**
   * Strip single-line and multi-line comment blocks
   * @param sql  The SQL string
   * @return  The SQL string without comments
   * @private
   */
  _stripComments(sql: string) {
    // multiline comments
    sql = sql.replace(/\/\*[\s\S]*?\*\//g, '');
    // single line comments -- dashes
    sql = sql.replace(/--([\r\n]|\s+[^\r\n]+[\r\n])/g, '');
    // single line comments #hashes
    sql = sql.replace(/#[^\r\n]+[\r\n]/g, '');
    return sql;
  }

  /**
   * Before splitting into SQL clauses, extract some regex-able subQueries
   * @param sql  The unparsed sql string
   * @return  An array with new sql and subQueries
   * @private
   */
  _extractSubQueries(sql: string) {
    const subQueries = {};
    let i = 0;
    const extractor = $0 => {
      const placeholder = `~~SUBQUERY_${i++}~~`;
      subQueries[placeholder] = $0;
      return placeholder;
    };
    // subselect in FROM clause
    sql = sql.replace(/\(\s*SELECT\s+.+\)\s+AS\s+[^\s,]+/, extractor);
    // IF() in FROM clause
    sql = sql.replace(/\bIF\s*\(.+\)\s+AS\s+[^\s,]+/, extractor);
    // IN (SELECT *) in JOINs, WHERE or HAVING
    sql = sql.replace(/\bIN\s*\(\s*SELECT\s.+?\)/, extractor);
    return { sql, subQueries };
  }

  /**
   * Inject column subQueries back into this object
   * @param subQueries  The lookup of extracted subQueries
   * @private
   */
  _injectSubQueries(subQueries: Record<string, string>) {
    const replacer = $0 => {
      return subQueries[$0] || $0;
    };
    const mapper = clause => {
      return clause.replace(/~~SUBQUERY_\d+~~/g, replacer);
    };
    this.query._columns = this.query._columns.map(replacer);
    this.query._joins = this.query._joins.map(mapper);
    this.query._wheres = this.query._wheres.map(mapper);
    this.query._havings = this.query._havings.map(mapper);
  }

  /**
   * Split SQL into clauses (used by parse())
   * @param sql  The SQL to split
   * @return
   * @private
   */
  _split(sql: string) {
    const splitter =
      /(?:^|\s)(SELECT|FROM|(?:INNER|LEFT\s+OUTER|RIGHT\s+OUTER|LEFT|RIGHT|CROSS|FULL|FULL\s+OUTER)\s+JOIN|WHERE|GROUP\s+BY|HAVING|ORDER\s+BY|LIMIT|OFFSET)\b/i;
    return sql.split(splitter);
  }

  /**
   * Get a QuickSelect object representing the given SQL SELECT statement
   * @param  rawSql  The raw SQL for the SELECT statement
   * @return True if the SQL was parsed successfully
   */
  parse(rawSql: string) {
    const stripped = this._stripComments(rawSql);
    const { sql, subQueries } = this._extractSubQueries(stripped);
    const expressions = this._split(sql);
    let i = 1;
    while (i < expressions.length) {
      const rawKeyword = expressions[i++].trim();
      const keyword = rawKeyword.toUpperCase().replace(/\s+/g, '_');
      const clause = expressions[i++].trim();
      const handler = `_handle${keyword}`;
      this[handler](clause);
    }
    this._injectSubQueries(subQueries);
    return true;
  }

  /**
   * Handle SQL_CALC_FOUND_ROWS and column names
   * @param clause  The clause after the SELECT
   * @private
   */
  _handleSELECT(clause: string) {
    let columns = clause.split(/s*,s*/);
    // now handle parenthesis expressions that contain commas
    let buffer = '';
    columns.forEach((column, i) => {
      if (i === 0) {
        const optionRegex = /^(SQL_CALC_FOUND_ROWS)\s+/i;
        const match = column.match(optionRegex);
        if (match) {
          this.query.option(match[1]);
          column = column.replace(optionRegex, '');
        }
      }
      if (buffer.length) {
        // we are in the middle of an expression containing parenthesis
        if (column.indexOf(')') > 0) {
          // we have an end parenthesis
          buffer += column;
          this.query.column(buffer.trim());
          buffer = '';
        } else {
          buffer += column + ',';
        }
      } else if (column.match(/\([^)]+$/)) {
        buffer = column + ',';
      } else {
        this.query.column(column.trim());
      }
    });
  }

  /**
   * Handle table names
   * @param clause  The clause after the FROM
   * @private
   */
  _handleFROM(clause: string) {
    const tables = clause.split(/\s*,\s*/);
    tables.forEach(table => this.query.table(table));
  }

  /**
   * Handle INNER JOIN statements
   * @param clause  The clause after the INNER JOIN
   * @private
   */
  _handleINNER_JOIN(clause: string) {
    this.query.innerJoin(clause);
  }

  /**
   * Handle LEFT JOIN statements
   * @param clause  The clause after the LEFT JOIN
   * @private
   */
  _handleLEFT_JOIN(clause: string) {
    this.query.leftJoin(clause);
  }

  /**
   * Handle LEFT OUTER JOIN statements
   * @param clause  The clause after the LEFT OUTER JOIN
   * @private
   */
  _handleLEFT_OUTER_JOIN(clause: string) {
    this.query.leftOuterJoin(clause);
  }

  /**
   * Handle RIGHT JOIN statements
   * @param clause  The clause after the RIGHT JOIN
   * @private
   */
  _handleRIGHT_JOIN(clause: string) {
    this.query.rightJoin(clause);
  }

  /**
   * Handle RIGHT OUTER JOIN statements
   * @param clause  The clause after the RIGHT OUTER JOIN
   * @private
   */
  _handleRIGHT_OUTER_JOIN(clause: string) {
    this.query.rightOuterJoin(clause);
  }

  /**
   * Handle CROSS JOIN statements
   * @param clause  The clause after the CROSS JOIN
   * @private
   */
  _handleCROSS_JOIN(clause: string) {
    this.query.crossJoin(clause);
  }

  /**
   * Handle FULL JOIN statements
   * @param clause  The clause after the FULL JOIN
   * @private
   */
  _handleFULL_JOIN(clause: string) {
    this.query.fullJoin(clause);
  }

  /**
   * Handle FULL OUTER JOIN statements
   * @param clause  The clause after the FULL OUTER JOIN
   * @private
   */
  _handleFULL_OUTER_JOIN(clause: string) {
    this.query.fullOuterJoin(clause);
  }

  /**
   * Handle WHERE conditions
   * @param clause  All the conditions after WHERE
   * @private
   */
  _handleWHERE(clause: string) {
    if (/^(1|'1'|true)$/i.test(clause)) {
      this.query._wheres.push(clause);
    } else {
      this._handleConditions('where', clause);
    }
  }

  /**
   * Handle HAVING statements
   * @param clause  All the conditions after HAVING
   * @private
   */
  _handleHAVING(clause: string) {
    this._handleConditions('having', clause);
  }

  /**
   * Build a conditions list
   * @param type  Either where or having
   * @param clause  The expressions following the type keyword
   * @private
   */
  _handleConditions(type: 'where' | 'having', clause: string) {
    const andGroups = clause.split(/\bAND\b/i);
    andGroups.forEach(andGroup => {
      const orPieces = andGroup.split(/\bOR\b/i).map(str => str.trim());
      if (orPieces.length === 1) {
        // no OR operators
        const fn = type; // either where or having
        this.query[fn](orPieces[0]);
      } else {
        // some OR operators
        // either orWhere or orHaving
        const orFn = type === 'where' ? 'orWhere' : 'orHaving';
        this.query[orFn](orPieces.map(p => [p]));
      }
    });
  }

  /**
   * Handle GROUP BY statements
   * @param clause  The clauses after the GROUP BY
   * @private
   */
  _handleGROUP_BY(clause: string) {
    const columns = clause.split(/\s*,\s*/);
    columns.forEach(column => this.query.groupBy(column));
  }

  /**
   * Handle ORDER BY statements
   * @param clause  The clause after the ORDER BY
   * @private
   */
  _handleORDER_BY(clause: string) {
    const columns = clause.split(/\s*,\s*/);
    columns.forEach(column => this.query.orderBy(column));
  }

  /**
   * Handle LIMIT statements including "LIMIT #" and "LIMIT #, #"
   * @param clause  The clause after the LIMIT
   * @private
   */
  _handleLIMIT(clause: string) {
    const offsetLimit = clause.match(/^(\d+|\?|:\w+)\s*,\s*(\d+|\?|:\w+)$/);
    if (offsetLimit) {
      this.query.offset(offsetLimit[1]);
      this.query.limit(offsetLimit[2]);
    } else {
      this.query.limit(clause);
    }
  }

  /**
   * Handle OFFSET statements
   * @param clause  The number after the OFFSET
   * @private
   */
  _handleOFFSET(clause: string) {
    this.query.offset(clause);
  }
}
