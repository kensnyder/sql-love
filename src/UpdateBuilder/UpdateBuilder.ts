import { EngineStyle } from '../SelectBuilder/SelectBuilder';
import {
  WhereCriteria,
  buildConditions,
} from '../buildConditions/buildConditions';
import { getDefaultEngine, getQuoter } from '../defaultEngine/defaultEngine';

export default class UpdateBuilder {
  declare _arrayFields: [
    'options',
    'sets',
    'tables',
    'joins',
    'wheres',
    'orderBys',
    'returning',
  ];

  declare _scalarFields: ['limit', 'offset', 'page'];

  _tables: string[] = [];
  _sets: string[] = [];
  _wheres: string[] = [];
  _returning: any = null;
  constructor(tables?: string | string[]) {
    this._tables = Array.isArray(tables) ? tables : [tables];
    this._returning = null;
  }
  table(table: string) {
    this._tables = [table];
    return this;
  }
  tables(tables: string[]) {
    this._tables = tables;
    return this;
  }
  // set(set: string);
  // set(set: Record<string, any>);
  // set(set: string, value: any) {
  //   this._sets = set;
  //   return this;
  // }
  where(...args: WhereCriteria) {
    buildConditions(this._wheres, this._bindings, args);
    return this;
  }
  returning(returning: string | string[]) {
    const quote = getQuoter();
    this._returning = Array.isArray(returning)
      ? returning.map(quote).join(', ')
      : returning;
    return this;
  }
  compile({
    engine = getDefaultEngine(),
    bindingIndex = 1,
  }: {
    engine?: EngineStyle;
    bindingIndex?: number;
  } = {}) {
    if (this._sets.length === 0) {
      throw new Error('Set values are required to compile update statements');
    }
    // const placeholderGroups: string[] = [];
    // let idx = bindingIndex - 1;
    // const bindings: any[] = [];
    // for (const batch of this._batches) {
    //   const placeholders: string[] = [];
    //   for (let i = 0; i < this._fields.length; i++) {
    //     placeholders.push(`__BOUND_${idx++}__`);
    //     bindings.push(batch[i]);
    //   }
    //   placeholderGroups.push(`(${placeholders.join(', ')})`);
    // }
    // const fieldNames = this._fields.join(', ');
    // const groups = placeholderGroups.join(', ');
    // let sql = `UPDATE ${table} SET ${set} WHERE ${where}`;
    // if (this._returning) {
    //   sql += ` RETURNING ${this._returning}`;
    // }
    // return replaceBindings(sql, bindings, {
    //   engine,
    //   bindingIndex,
    // });
  }
}
