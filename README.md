# sql-love

[![NPM Link](https://badgen.net/npm/v/sql-love?v=0.9.2)](https://npmjs.com/package/sql-love)
[![Dependencies](https://badgen.net/static/dependencies/0/green?v=0.9.2)](https://npmjs.com/package/sql-love)
[![Build Status](https://github.com/kensnyder/sql-love/actions/workflows/node.js.yml/badge.svg?v=0.9.2)](https://github.com/kensnyder/sql-love/actions)
[![Code Coverage](https://codecov.io/gh/kensnyder/sql-love/branch/main/graph/badge.svg?v=0.9.2)](https://codecov.io/gh/kensnyder/sql-love)
[![ISC License](https://badgen.net/static/license/ISC/green?v=0.9.2)](https://opensource.org/licenses/ISC)

Classes for parsing and building SQL select queries in Node

## Installation

```bash
npm install sql-love
```

## Table of Contents

- [SelectBuilder](#selectbuilder)
  - [Parsing base SQL](#parsing-base-sql)
  - [Building the Query](#building-the-query)
  - [Counting Results](#counting-results)
  - [Other Methods](#other-methods)
  - [new SelectBuilder() Limitations](#selectparse-limitations)
- [How to Contribute](./CONTRIBUTING.md)
- [ISC License](./LICENSE.md)

## SelectBuilder

A Select object represents a SQL SELECT query and allows dynamically adding
clauses including JOIN, WHERE, ORDER BY, LIMIT, OFFSET.

### Parsing base SQL

You can define a base query and pass it to the SelectBuilder constructor.

```js
const { SelectBuilder } = require('sql-love');
const query = new SelectBuilder(`
  SELECT u.id, u.fname, u.lname, u.email, p.phone
  FROM users
  LEFT JOIN phone_numbers p ON p.user_id = u.id
    AND p.type = 'main'
  WHERE u.is_active = 1
`);
if (email) {
  query.where('u.email', email);
}
if (areaCode) {
  query.where('p.phone', 'LIKE ?%', areaCode);
}
query.sort(sortField);
query.limit(limitTo);
const { sql, bindings } = query.compile();

// then execute the SQL in your preferred client:
// like mysql2
mysql.query(sql, bindings);
// or Prisma
const result = await prisma.$executeRaw(sql, bindings);
```

It is possible to add placeholders to the base query.

```js
const query = new SelectBuilder(
  `
    SELECT u.id, u.fname, u.lname, u.email, a.city, a.zip
    FROM users
    LEFT JOIN addresses a ON a.user_id = u.id
    WHERE a.state = :state
      AND a.city IN (:city)
  `,
  { state: 'CA', city: ['San Francisco', 'Los Angeles'] }
);

const { sql, bindings } = query.compile();
/* 
Then "sql" equals:

SELECT u.id, u.fname, u.lname, u.email, a.city, a.zip
FROM users
LEFT JOIN addresses a ON a.user_id = u.id
WHERE a.state = ?
  AND a.city IN (?, ?)
  
And "bindings" equals:

['CA', 'San Francisco', 'Los Angeles'] 
*/
```

You may specify a compiler engine to use. The default is `"mysql"`.

```js
const query = new SelectBuilder('SELECT * FROM users')
  .limit(10)
  .page(3)
  .where('id', 1);

query.compile('mysql').sql;
// SELECT * FROM users WHERE id = ? OFFSET 20 LIMIT 10

query.compile('pg').sql;
// SELECT * FROM users WHERE id = $1 OFFSET 20 LIMIT 10

query.compile('mssql').sql;
// SELECT * FROM users WHERE id = ? OFFSET 20 ROWS FETCH NEXT 10 ROWS ONLY

query.compile('oracle').sql;
// SELECT * FROM users WHERE id = ? OFFSET 20 ROWS FETCH NEXT 10 ROWS ONLY
```

### Building the Query

Use the following methods to build queries.

- `query.where(column, operator, value)` - Require column satisfy operator
- `query.where(column, value)` - Require column equal a value
- `query.where(expression)` - Add an arbitrary WHERE expression
- `query.where(columnValueRecord)` - Add multiple conditions
- `query.whereBetween(column, [min, max])` - Require value BETWEEN, < or >
- `query.orWhere(conditions)` - Specify multiple `where()`s joined by `OR`
- `query.having(column, operator, value)` - Having column satisfy operator
- `query.having(column, value)` - Having column equal value
- `query.having(expression)` - Having an arbitrary expression
- `query.having(columnValueRecord)` - Add multiple conditions
- `query.orHaving(expressions)` - Multiple `having()`s joined by OR
- `query.orderBy(column)` - Add ORDER BY clause
- `query.sortField(column, mapNames)` - Add ORDER BY clause with mapNames
- `query.limit(num)` - Limit by the given number
- `query.offset(num)` - Specify an offset
- `query.page(num)` - Automatically calculate offset based on limit and page
- `query.columns(columnNames)` - Add column names to fetch (alias `select()`)
- `query.column(columnName)` - Add a column name to fetch
- `query.table(tableName)` - Specify the table in the FROM clause
- `query.from(tableName)` - Same as above
- `query.join(expression)` - Add a JOIN expression
- `query.innerJoin(expression)` - Add an INNER JOIN expression
- `query.leftJoin(expression)` - Add a LEFT JOIN expression
- `query.fullJoin(expression)` - Add a FULL JOIN expression
- `query.rightJoin(expression)` - Add a RIGHT JOIN expression
- `query.crossJoin(expression)` - Add a CROSS JOIN expression
- `query.leftOuterJoin(expression)` - Add a LEFT OUTER JOIN expression
- `query.fullOuterJoin(expression)` - Add a FULL OUTER JOIN expression
- `query.rightOuterJoin(expression)` - Add a RIGHT OUTER JOIN expression
- `query.groupBy(column)` - Group by a column or expression

### Counting Results

One powerful feature of SelectBuilder is that it can construct a count query
to determine the number of results that would have been returned if there were
no LIMIT.

```js
const query = new SelectBuilder('SELECT id, name FROM users LIMIT 5');

const { sql } = query.compileCount();
// SELECT COUNT(*) AS found_rows FROM users
```

With queries that have a "HAVING" clause, the main query will be wrapped in a
count query.

```js
const query = new SelectBuilder(`
  SELECT category, COUNT(*) 
  FROM posts 
  GROUP BY category 
  HAVING COUNT(*) > 1
`);

const { sql } = query.compileCount();
/*
SELECT COUNT(*) AS found_rows FROM (
  SELECT category, COUNT(*) 
  FROM posts 
  GROUP BY category 
  HAVING COUNT(*) > 1
) AS subquery_results
*/
```

### Other methods

SelectBuilder has a few other useful methods.

- `query.getClone()` - Get an exact copy of this query object
- `query.unjoin(tableName)` - Remove a join expression
- `query.reset(field)` - Reset a single aspect of the query (e.g. 'where' or 'having')
- `query.reset(fields)` - Reset a few particular aspects of the query (e.g. \['where', 'having'\])
- `query.reset()` - Reset query to an empty state

### Parser Limitations

`new SelectBuilder(sql)` uses regular expressions and is not a true parser.
The goal is to be fast and useful for 99% of situations.

Below are some limitations illustrated by example.

#### Nested Subqueries

Most subqueries can be parsed but sub-subqueries don't work.

```js
// ❌ WILL NOT WORK
const query = new SelectBuilder(`
SELECT * FROM categories_posts WHERE category_id IN(
    SELECT id FROM categories WHERE client_id IN(
        SELECT client_id FROM affiliations WHERE name LIKE 'test'
    )
)`);

// ✅ WORKING EQUIVALENT
const query = new SelectBuilder(`SELECT * FROM categories_posts`);
const subquery =
  new SelectBuilder(`SELECT id FROM categories WHERE client_id IN(
    SELECT client_id FROM affiliations WHERE name LIKE 'test'
)`);
query.where(`category_id IN(${subquery})`);
```

#### Keywords in Strings

If you need to use SQL keywords in strings, use bindings.

```js
// ❌ WILL NOT WORK
new SelectBuilder(`SELECT id, CONCAT('where ', expr) FROM users`);

// ✅ WORKING EQUIVALENT
new SelectBuilder(`SELECT id, CONCAT(:prefix, expr) FROM users`, {
  prefix: 'where ',
});
```

#### Nested OR and AND Clauses

Nested logic can't be parsed properly.

```js
// ❌ WILL NOT WORK
new SelectBuilder(`
  SELECT * FROM users
  WHERE (
      fname = 'Matthew' AND (
          lname LIKE '%john' OR lname LIKE 'john%'
      ) OR (
          id > 0 AND is_active IS NOT NULL
      )
  )
`);

// ✅ WORKING EQUIVALENT
const query = new SelectBuilder(`SELECT * FROM users`);
query.orWhere([
  "fname = 'Matthew' AND (lname LIKE '%john' OR lname LIKE 'john%')",
  'id > 0 AND is_active IS NOT NULL',
]);
```
