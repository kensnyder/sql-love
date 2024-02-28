import { EngineStyle } from '../SelectBuilder/SelectBuilder';
import {
  getDefaultEngine,
  getQuoter,
  replaceBindings,
} from '../defaultEngine/defaultEngine';

export default class InsertBuilder {
  _table: string;
  _fields: string[];
  _batches: any[];
  _returning: any;
  constructor(table: string) {
    this._table = table;
    this._fields = [];
    this._batches = [];
    this._returning = null;
  }
  table(table: string) {
    this._table = table;
    return this;
  }
  record(record: Record<string, any>) {
    const shouldPushFields = this._fields.length === 0;
    const quote = getQuoter();
    const values: any[] = [];
    for (const key in record) {
      if (!Object.prototype.hasOwnProperty.call(record, key)) {
        continue;
      }
      if (shouldPushFields) {
        this._fields.push(quote(key));
      }
      values.push(record[key]);
    }
    this._batches.push(values);
    return this;
  }
  records(records: Array<Record<string, any>>) {
    for (const record of records) {
      this.record(record);
    }
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
    if (this._fields.length === 0 || this._batches.length === 0) {
      throw new Error(
        'Fields and values are required to compile insert statements'
      );
    }
    const placeholderGroups: string[] = [];
    let idx = bindingIndex - 1;
    const bindings: any[] = [];
    for (const batch of this._batches) {
      const placeholders: string[] = [];
      for (let i = 0; i < this._fields.length; i++) {
        placeholders.push(`__BOUND_${idx++}__`);
        bindings.push(batch[i]);
      }
      placeholderGroups.push(`(${placeholders.join(', ')})`);
    }
    const fieldNames = this._fields.join(', ');
    const groups = placeholderGroups.join(', ');
    let sql = `INSERT INTO ${this._table} (${fieldNames}) VALUES ${groups}`;
    if (this._returning) {
      sql += ` RETURNING ${this._returning}`;
    }
    return replaceBindings(sql, bindings, {
      engine,
      bindingIndex,
    });
  }
}
