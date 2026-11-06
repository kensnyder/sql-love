## Change Log

### v2.0.0 - 6 Nov 2026

**Breaking changes**

- MySQL pagination now emits `LIMIT n OFFSET m` (was the invalid `OFFSET m LIMIT n`); offset-only emits `LIMIT 18446744073709551615 OFFSET m`
- Oracle placeholders are now `:1, :2...` and MSSQL placeholders are `@P1, @P2...` (both were `?`); `bindingIndex` is honored for both
- `where()`/`having()` now throw instead of silently emitting different SQL when:
  - a value is `undefined` (use `null` to compare against NULL)
  - the number of `?` placeholders doesn't match the number of values
  - an array value is used with an operator other than `=`, `IN`, `!=`, `<>`, `NOT IN`
  - `null` is used with an operator other than `=`, `IS`, `!=`, `<>`, `NOT`, `IS NOT`
  - BETWEEN receives anything other than a two-item array without nulls (use `whereBetween()` for open ranges)
  - LIKE receives `null`
  - the condition is `null`, `undefined`, or an array
- `join()` and friends throw when a non-empty bindings array doesn't match the number of `?` placeholders
- `limit()` throws on strings that aren't positive integers (was silently ignored)
- `reset()` throws on unknown field names (including `''`)
- `orWhere()`/`orHaving()` with an array of objects now ANDs the keys within each object: `[{a, b}, {c}]` => `((a AND b) OR c)`
- Parsing `LIMIT ?`, `OFFSET ?` or `FETCH NEXT ? ROWS ONLY` with positional placeholders now throws (the limit was previously dropped)

**Fixes**

- `orWhere()`/`orHaving()` no longer lose their wrapping parentheses, which could let an OR escape surrounding AND conditions
- Oracle `limit()` was silently dropped; now emits `FETCH NEXT n ROWS ONLY`
- MSSQL always emits `OFFSET m ROWS` before `FETCH NEXT` and adds `ORDER BY (SELECT NULL)` when paginating without an ORDER BY
- `compileCount()` with GROUP BY (no HAVING) always counted 1; it now counts groups
- `compileCount()` wraps DISTINCT/DISTINCTROW queries in a subquery, removes ORDER BY from the subquery, and drops options like `SQL_CALC_FOUND_ROWS` and `TOP n` there
- `reset()` now works with plural field names (`wheres`, `columns`, ...) and with `join`/`joins`
- `where('name LIKE %?%', ['joe'])` with a one-item array emitted invalid SQL
- `where('a = ?', 5)` and `having('COUNT(*) > ?', 2)` emitted `? ?`; a scalar value now binds to the single placeholder (pg jsonb `?`, `?|`, `?&` operators still work)
- Empty LIKE arrays are omitted instead of emitting `WHERE ()`
- Empty or whitespace-only conditions are ignored
- LIKE values containing `$&`, `$'` or `$$` replacement patterns were corrupted
- LIKE with `0` bound `''` instead of `'0'`
- `where()` and `join()` no longer empty the caller's bindings array
- Operators are upper-cased without locale rules (fixes `in`/`like` on Turkish-locale hosts)
- `unjoin()` escapes regex characters in table names, matches JOIN case-insensitively, and only matches the start of a join
- Parser: plain `JOIN`, `NATURAL JOIN`, and newlines/extra spaces between join keywords are now parsed as joins
- Parser: supports `LIMIT ALL`, named-binding limits/offsets (`LIMIT :n`), `FETCH FIRST n ROWS ONLY`, `OFFSET n ROW(S)`, and a trailing `;`

### v1.2.0 - 6 Nov 2026

- Automatically omit `IN`/`NOT IN` conditions when passed binding is an empty array

### v1.1.5 - 9 Oct 2026

- Fix regression where a SQL string with no constructor bindings had every colon (e.g. `::numeric`) replaced with a binding
- Constructor named bindings now ignore `::casts` and only match whole `:name` tokens

### v1.1.4 - 9 Oct 2026

- `sortField()` now only accepts field names present in `mapNames`; unknown fields emit a `console.warn` and add no ORDER BY clause (prevents SQL injection from unsanitized input)
- Upgrade Deps

### v1.1.3 - 14 Aug 2026

- Fix subqueries with empty bindings
- Upgrade Deps

### v1.1.2 - 14 Aug 2026

- Fix `whereBetween` with strings
- Upgrade Deps

### v1.1.0 - 31 Jul 2025

- sortField(): support modifiers
- sortField(): support hyphenated lookups
- README.md: Documentation for orderBy() and sortField()
- Upgrade deps

### v1.0.5 - 16 Mar 2025

- Upgrade deps

### v1.0.0 - 12 Dec 2023

- Upgrade to vitest v1
- More documentation
- 100% test coverage
- First stable release

### v0.9.7 - 7 Dec 2023

- Added extractLookup utility
- Added toSafeJson utilities

### v0.9.6 - 5 Dec 2023

- Utility functions (extractGrouped, extractIndexed, getPagination, runPrisma, runMysql)
- Added `SelectBuilder.setDefaultEngine(engine)`
- More documentation
- Fix `.sortField()` logic

### v0.9.4 - 30 Nov 2023

- Support parsing and building "ILIKE" and "NOT ILIKE"

### v0.9.2 - 30 Nov 2023

- Fixes to readme

### v0.9.1 - 30 Nov 2023

- More documentation
- GitHub Actions CI
- Support for parsing "OFFSET # ROWS"
- Support for parsing "FETCH NEXT # ROWS ONLY"

### v0.9.0 - 29 Nov 2023

- Initial release with `SelectBuilder`
