import substrCount from '../substrCount/substrCount';

export type WhereCriteria =
  | [string, string, any]
  | [string, any]
  | [string]
  | [Record<string, any>];

/**
 * Utility function to add conditions for a clause (WHERE, HAVING)
 * @param  collection  The collection to add the clauses to (e.g. this._wheres or this._havings)
 * @param  bindings  An array to push bound values onto
 * @param  criteria  Criteria adhering to WhereCriteria type
 * @example  The following are equivalent
 *   buildConditions(this._wheres, bindings, ['deleted_at IS NULL']);
 *   buildConditions(this._wheres, bindings, ['deleted_at', null]);
 *   buildConditions(this._wheres, bindings, ['deleted_at', '=', null]);
 * @example  More examples
 *   buildConditions(this._wheres, bindings, ['fname', 'LIKE', 'joe']); // `fname` LIKE 'joe'
 *   buildConditions(this._wheres, bindings, ['fname', 'LIKE ?', 'joe']); // `fname` LIKE 'joe'
 *   buildConditions(this._wheres, bindings, ['fname LIKE %?%', 'joe']); // `fname` LIKE '%joe%'
 *   buildConditions(this._wheres, bindings, ['fname LIKE ?%', 'joe']); // `fname` LIKE 'joe%'
 *   buildConditions(this._wheres, bindings, ['fname', 'LIKE ?%', 'joe']); // `fname` LIKE 'joe%'
 *   buildConditions(this._wheres, bindings, ['price >', 10]); // `price` > 10
 *   buildConditions(this._wheres, bindings, ['price', '>', 10]); // `price` > 10
 *   buildConditions(this._wheres, bindings, ['price =', 10]); // `price` = 10
 *   buildConditions(this._wheres, bindings, ['price !=', 10]); // `price` != 10
 *   buildConditions(this._wheres, bindings, ['price', 10]); // `price` = 10
 *   buildConditions(this._wheres, bindings, ['price', '=', 10]); // `price` = 10
 *   buildConditions(this._wheres, bindings, ['price', '!=', 10]); // `price` != 10
 *   buildConditions(this._wheres, bindings, ['price', 'BETWEEN', [10,20]]); // `price` BETWEEN 10 AND 20
 *   buildConditions(this._wheres, bindings, ['price', 'NOT BETWEEN', [10,20]]); // `price` NOT BETWEEN 10 AND 20
 *   buildConditions(this._wheres, bindings, ['price', [10,20]]); // `price` IN(10,20)
 *   buildConditions(this._wheres, bindings, ['price', '=', [10,20]]); // `price` IN(10,20)
 *   buildConditions(this._wheres, bindings, ['price', 'IN', [10,20]]); // `price` IN(10,20)
 *   buildConditions(this._wheres, bindings, ['price', 'NOT IN', [10,20]]); // `price` NOT IN(10,20)
 */
export function buildConditions(
  collection: string[],
  bindings: any[],
  criteria: WhereCriteria
) {
  const numArgs = criteria.length;
  let [column, operator, value] = criteria;
  if (typeof column === 'object') {
    for (const keyValue of Object.entries(column)) {
      buildConditions(collection, bindings, keyValue);
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
      bindings.push(values.shift());
      return `__BOUND_${bindings.length - 1}__`;
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
    const one = bindings.length;
    const two = bindings.length + 1;
    collection.push(
      `${column} ${operator} __BOUND_${one}__ AND __BOUND_${two}__`
    );
    bindings.push(value[0], value[1]);
  } else if (likeMatch) {
    const like = likeMatch[1].toUpperCase(); // Either "LIKE", "NOT LIKE" etc.
    const infix = likeMatch[2] || '?'; // ONE OF ?% or %?% or %? or ?
    if (Array.isArray(value)) {
      const ors = [];
      for (const v of value) {
        ors.push(`${column} ${like} __BOUND_${bindings.length}__`);
        bindings.push(infix.replace('?', v));
      }
      const joined = ors.join(' OR ');
      collection.push(`(${joined})`);
    } else {
      collection.push(`${column} ${like} __BOUND_${bindings.length}__`);
      bindings.push(infix.replace('?', value || ''));
    }
  } else if (value === null) {
    collection.push(
      operator === '=' ? `${column} IS NULL` : `${column} IS NOT NULL`
    );
  } else if (Array.isArray(value)) {
    // an array of values should be IN or NOT IN
    const inVals = [];
    for (let i = 0; i < value.length; i++) {
      inVals.push(`__BOUND_${bindings.length}__`);
      bindings.push(value[i]);
    }
    const joined = inVals.join(', ');
    collection.push(
      operator === '=' || operator === 'IN'
        ? `${column} IN(${joined})`
        : `${column} NOT IN(${joined})`
    );
  } else if (operator === 'IN' || operator === 'NOT IN') {
    // in clause that is not array
    collection.push(`${column} ${operator}(__BOUND_${bindings.length}__)`);
    bindings.push(value);
  } else {
    collection.push(`${column} ${operator} __BOUND_${bindings.length}__`);
    bindings.push(value);
  }
  return this;
}
