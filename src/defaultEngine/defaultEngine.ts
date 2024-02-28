export type EngineStyle = 'mssql' | 'mysql' | 'oracle' | 'pg' | 'sqlite';

let defaultEngine: EngineStyle = 'mysql';
let quoter = s => s;

export function setDefaultEngine(engine: EngineStyle) {
  defaultEngine = engine;
}

export function getDefaultEngine() {
  return defaultEngine;
}

export function resetDefaultEngine() {
  defaultEngine = 'mysql';
}

export function setQuoter(q: (s: string) => string) {
  quoter = q;
}

export function getQuoter() {
  return quoter;
}

export function resetQuoter() {
  quoter = s => s;
}

export function replaceBindings(
  sql: string,
  bindings: any[],
  {
    engine = defaultEngine,
    bindingIndex = 1,
  }: {
    engine?: EngineStyle;
    bindingIndex?: number;
  }
) {
  let replacer: (match0: string, match1: string) => string;
  const orderedBindings: any = [];
  if (engine === 'pg') {
    replacer = (_, $1) => {
      orderedBindings.push(bindings[$1]);
      return '$' + bindingIndex++;
    };
  } else {
    replacer = (_, $1) => {
      orderedBindings.push(bindings[$1]);
      return '?';
    };
  }
  return {
    sql: sql.replace(/__BOUND_(\d+)__/g, replacer),
    bindings: orderedBindings,
  };
}
