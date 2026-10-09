## Change Log

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
