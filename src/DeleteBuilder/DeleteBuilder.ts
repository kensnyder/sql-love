import BaseQueryBuilder from '../BaseQueryBuilder/BaseQueryBuilder';
import {
  getDefaultEngine,
  replaceBindings,
  type EngineStyle,
} from '../defaultEngine/defaultEngine';

/**
 * Base class for building SELECT, UPDATE, and DELETE queries
 * Class Select
 */
export default class DeleteBuilder extends BaseQueryBuilder {
  /**
   * The list of strings to come immediately after "DELETE"
   * and before the table name. (e.g. "LOW_PRIORITY" or "IGNORE")
   * @private
   */
  _options: string[] = [];

  declare _arrayFields: ['options', 'tables', 'joins', 'wheres', 'orderBys'];

  declare _scalarFields: ['limit', 'offset', 'page'];

  /**
   * Add a table to the "FROM" clause (same as .from())
   * @param {String} tableName  The name of the table to query
   */
  from(tableName: string) {
    return this.table(tableName);
  }

  /**
   * Get the SQL as a pretty-printed string alongside an array of bindings
   * @param engine  The database engine style (mssql, mysql, oracle, pg)
   * @return The SQL query as a string
   */
  compile({
    engine = getDefaultEngine(),
    bindingIndex = 1,
  }: {
    engine?: EngineStyle;
    bindingIndex?: number;
  } = {}) {
    // build all the lines
    const lines = [
      'DELETE',
      this._options.length ? `  ${this._options.join('\n  ')}` : null,
      `FROM ${this._tables.join(', ')}`,
      this._joins.length ? this._joins.join('\n') : null,
      this._wheres.length ? `WHERE ${this._wheres.join('\n  AND ')}` : null,
      this._orderBys.length ? `ORDER BY ${this._orderBys.join(',\n  ')}` : null,
    ];
    this._compilePaginationToLines(lines, engine);

    const pretty = lines.filter(Boolean).join('\n').trim();
    return replaceBindings(pretty, this._bindings, { engine, bindingIndex });
  }

  /**
   * Clone this builder object
   */
  getClone() {
    const copy = new DeleteBuilder();
    this._arrayFields.forEach(f => (copy[f] = [...this[f]]));
    this._scalarFields.forEach(f => (copy[f] = this[f]));
    return copy;
  }
}
