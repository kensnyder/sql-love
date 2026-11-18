# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`sql-love` is a zero-dependency npm library for parsing and building SQL SELECT queries (`SelectBuilder`), plus small result-set utilities. It is developed, tested and built with Bun, and published as ESM + CJS + bundled `.d.ts` in `dist/`.

## Commands

```bash
bun install                 # deps are pinned exactly (bunfig.toml: exact = true)
bun test                    # run all specs
bun test src/Parser         # run one spec file (path substring match)
bun test -t "orWhere"       # run tests whose name matches a pattern
bun test --watch
bun run coverage            # CI runs coverage-lcov and uploads to codecov
bun typecheck               # type-check src/ and index.ts (specs included) via `bun check`
bun run build               # clean dist, bundle .d.ts, esbuild ESM + CJS, print gzip size
bunx prettier --write .     # no lint script; Prettier (with organize-imports plugin) is the only formatter
```

Run `bun typecheck` after any change to a `.ts` file (source or spec) and before committing or building; it must report no type errors. Nothing else catches them: `bun test` strips types without checking them, the build's d.ts step runs with `--no-check`, and CI does not run the typecheck. Fix errors with real types where possible rather than `any` or `@ts-ignore`. The check uses `tsconfig.json`, which covers `index.ts` and `src/**/*.ts`.

There is no lint script.

CI (`.github/workflows/build.yml`) runs the tests on Bun 1.3, 1.4 and latest.

## Layout conventions

- Each unit lives in `src/<name>/<name>.ts` with a sibling `<name>.spec.ts` (`bun:test`). Modules use a default export, except `runMysql`, `runPrisma` and `toSafeJson`, which export several named functions.
- `index.ts` at the repo root is the only public entry point; anything new must be re-exported there. `substrCount` is internal and intentionally not exported.
- The project has had 100% test coverage since 1.0; add specs alongside any behavior change.
- User-visible changes get a `CHANGELOG.md` entry and matching `README.md` docs (the README is the API documentation). Breaking changes are listed under a separate heading, as in the v2.0.0 entry.

## Architecture

### SelectBuilder state and binding markers

`SelectBuilder` holds a query as arrays of raw SQL fragments (`_options`, `_columns`, `_tables`, `_joins`, `_wheres`, `_groupBys`, `_havings`, `_orderBys`) plus numeric `_limit`/`_offset`/`_page` and a single `_bindings` array. The underscore-prefixed members are "private" by convention only: `Parser` and `getPagination` read and write them directly, and specs assert on them.

Values are never interpolated into fragments. `_bind(value)` pushes onto `_bindings` and returns a marker `__BOUND_n__` that is embedded in the fragment. `compile()` joins the fragments, then replaces markers in the order they appear in the final SQL, producing the output `bindings` array and the engine's placeholder style (`?` mysql, `$n` pg, `:n` oracle, `@Pn` mssql). Consequences:

- Fragments can be removed or reordered (`reset()`, `unjoin()`, `getFoundRowsQuery()`) without breaking binding order; unused entries in `_bindings` are simply not emitted.
- Any new code that accepts a value must go through `_bind()`, and anything that copies a builder must copy `_bindings` (see `getClone()`).
- `bindingIndex` offsets numbered placeholders; `compileUnion()` uses it to number the second query after the first.

### Engine differences

Engine-specific output is confined to `compile()` (placeholder style) and `_compilePagination()` / `_compileLIMIT()` / `_compileOFFSET()` (clause order and syntax, MySQL's max-limit for offset-only, MSSQL's forced `OFFSET 0 ROWS` and `ORDER BY (SELECT NULL)`). The default engine is module-level state set by `SelectBuilder.setDefaultEngine()`, initially `mysql`; specs that change it must restore it.

### Conditions

`where()`, `having()`, `orWhere()` and `orHaving()` all funnel into `_conditions(collection, criteria)`, which dispatches on argument count (1 = raw expression, 2 = column+operator string or `?` expression with value(s), 3 = column, operator, value) and on value type (null, array, scalar). Its docblock is the authoritative table of accepted forms and of the inputs that throw. Since 2.0 the policy is to throw on ambiguous input (undefined values, placeholder/value count mismatches, arrays or nulls with incompatible operators) rather than emit different SQL, while empty `IN`/`LIKE` arrays silently omit the condition. Several module-level regexes at the top of `SelectBuilder.ts` distinguish `?` placeholders from Postgres jsonb `?`, `?|`, `?&` operators and from `LIKE %?%` infix forms; changes there need to keep all three readings working.

`_orConditions()` always returns a fully parenthesized group so an OR can never combine with neighboring ANDs.

### Parser

`new SelectBuilder(sql, bindings)` first replaces `:name` tokens with `__BOUND_n__` markers (ignoring `::casts`), then hands the SQL to `Parser`, which is regex-based, not a real parser:

1. strip comments, 2. swap a limited set of subqueries for `~~SUBQUERY_n~~` placeholders, 3. `split()` on clause keywords, 4. dispatch each clause to `_handle<KEYWORD>` by name (e.g. `_handleLEFT_OUTER_JOIN`), which calls the public builder methods, 5. re-inject subqueries.

Adding a clause keyword means updating the splitter regex in `_split()` and adding a matching `_handle*` method. The documented limitations (nested subqueries, SQL keywords inside string literals, nested AND/OR) are accepted trade-offs described in the README's "Parser limitations" section, not bugs to fix by default.

### Count queries

`compileCount()` builds on `getFoundRowsQuery()`. `_countNeedsSubquery()` is the single decision point: with GROUP BY, HAVING or DISTINCT the un-paginated, unordered query is wrapped in `SELECT COUNT(*) AS found_rows FROM (...) AS subquery_results`; otherwise the columns are replaced with `COUNT(expr) AS found_rows`. The `found_rows` alias is a contract with `runMysql*WithCount` and `runPrismaWithCount`, which read it from the first row.

### Runners

`runMysql*` and `runPrisma*` take a structurally typed client (no driver is a dependency) and only skip the count query when the main query returns zero rows. `runPrisma*` passes `engine` through to `compile()`; pagination metadata comes from `getPagination(query, total)`.
