<img alt="SQL Love Logo" src="https://github.com/kensnyder/sql-love/raw/main/assets/sql-love-logo.png?v=1.0.3" width="250" height="208" />

# sql-love

[![NPM Link](https://badgen.net/npm/v/sql-love?v=1.0.3)](https://npmjs.com/package/sql-love)
[![Dependencies](https://badgen.net/static/dependencies/0/green?v=1.0.3)](https://www.npmjs.com/package/sql-love?activeTab=dependencies)
[![Build Status](https://github.com/kensnyder/sql-love/actions/workflows/node.js.yml/badge.svg?v=1.0.3)](https://github.com/kensnyder/sql-love/actions)
[![Code Coverage](https://codecov.io/gh/kensnyder/sql-love/branch/main/graph/badge.svg?v=1.0.3)](https://codecov.io/gh/kensnyder/sql-love)
[![ISC License](https://badgen.net/static/license/ISC/green?v=1.0.3)](https://opensource.org/licenses/ISC)

Classes for parsing and building SQL select queries in Node

## Installation

```bash
npm install sql-love
```

## Table of Contents

- [SelectBuilder](#selectbuilder)
  - [Parsing base SQL](#parsing-base-sql)
  - [SQL injection](#sql-injection)
  - [Building the Query](#building-the-query)
  - [More examples](#more-examples)
  - [Counting results](#counting-results)
  - [Other methods](#other-methods)
  - [Parser limitations](#parser-limitations)
- [Utility functions](#utility-functions)
  - [getPagination](#getpagination)
  - [extractGrouped](#extractgrouped)
  - [extractIndexed](#extractindexed)
  - [extractLookup](#extractlookup)
  - [runPrisma and runPrismaWithCount](#runprisma-and-runprismawithcount)
  - [runMysql and runMysqlWithCount](#runmysql-and-runmysqlwithcount)
  - [toSafeJson functions](#tosafejson)
- [How to contribute](./CONTRIBUTING.md)
- [ISC license](./LICENSE.md)

## SelectBuilder

A Select object represents a SQL SELECT query and allows dynamically adding
clauses including JOIN, WHERE, ORDER BY, LIMIT, OFFSET.

### Parsing base SQL

You can define a base query and pass it to the SelectBuilder constructor.

```js
import { SelectBuilder } from 'sql-love';

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
```

Then execute the SQL in your preferred client:

```js
// mysql2:
connection.query(sql, bindings, (err, results, fields) => {});

// Prisma:
const result = await prisma.$queryRawUnsafe(sql, ...bindings);

// Cloudflare d1
const { results } = await env.DB.prepare(sql)
  .bind(...bindings)
  .all();
```

_Note that these are prepared statements so the values in the "bindings"_
_array are safe from SQL injection, with the caveat that you are in charge of_
_quoting any identifiers. For instance, we don't recommend populating `u.email`_
_from user input in the example above. But if you do, be sure to use your_
_client's `quoteIdentifier()` function._

It is possible to add placeholders to the base query.

```js
import { SelectBuilder } from 'sql-love';

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
import { SelectBuilder, setDefaultEngine } from 'sql-love';

const query = new SelectBuilder('SELECT * FROM users')
  .limit(10)
  .page(3)
  .where('id', 1);

query.compile({ engine: 'mysql' }).sql;
query.compile({ engine: 'sqlite' }).sql;
// SELECT * FROM users WHERE id = ? OFFSET 20 LIMIT 10

query.compile({ engine: 'pg' }).sql;
// SELECT * FROM users WHERE id = $1 OFFSET 20 LIMIT 10

query.compile({ engine: 'mssql' }).sql;
query.compile({ engine: 'oracle' }).sql;
// SELECT * FROM users WHERE id = ? OFFSET 20 ROWS FETCH NEXT 10 ROWS ONLY

// Or you can specify the default engine to use in the compile function
setDefaultEngine('pg');
```

### SQL injection

You should use prepared statements to run the sql and bindings returned by
`SelectBuilder.compile()`. This will protect you from SQL injection.

Using `mysqlClient.query(sql, bindings)` and
`prisma.$queryRawUnsafe(sql, ...bindings)` are examples of using prepared
statements.

Note that even though the name `prisma.$queryRawUnsafe(sql, ...bindings)`
implies that the query is unsafe, it is actually safe because
`prisma.$queryRawUnsafe` uses prepared statements.

SQL Love also includes utility functions for running queries in mysql and
Prisma so you don't have to remember these functions. See documentation for
[runPrisma](#runprisma-and-runprismawithcount) and
[runMysql](#runmysql-and-runmysqlwithcount) below.

### Building the query

Use the following methods to build queries. And see
[more examples below](#where-examples).

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

### More examples

```js
// The following are equivalent
query.where('deleted_at', '=', null);
query.where('deleted_at', '=', undefined);
query.where('deleted_at', null);
query.where('deleted_at', undefined);
query.where('deleted_at IS NULL');
query.where({ deleted_at: null });
query.where({ deleted_at: undefined });

// the following demonstrate ways to use LIKE
query.where('name', 'LIKE', 'son');
query.where('name', 'LIKE ?', 'son');
query.where('name', 'LIKE ?%', 'son');
query.where('name', 'LIKE %?', 'son');
query.where('name', 'LIKE %?%', 'son');
query.where('name', 'LIKE', '%son%');

// The following demonstrate ways to use various operators
query.where('price', '=', 100);
query.where('price', '!=', 100);
query.where('price', '<>', 100);
query.where('price', '>', 100);
query.where({ 'price >': 100 });
query.where('price', 'BETWEEN', [100, 200]);
query.where('price', 'NOT BETWEEN', [100, 200]);
query.whereBetween('price', [100, 200]); // price BETWEEN 100 AND 200
query.whereBetween('price', [100, null]); // price > 100
query.whereBetween('price', [null, 200]); // price < 200
query.whereBetween('price', [null, null]); // clause is ignored

// The following demonstrate ways to use IN and NOT IN
query.where('status', 'IN', ['pending', 'approved']);
query.where('status', ['pending', 'approved']);
query.where('status', '=', ['pending', 'approved']);
query.where('status', '!=', ['pending', 'approved']);
query.where('status', 'NOT IN', ['pending', 'approved']);
query.where({ status: ['pending', 'approved'] });
query.where({ 'status NOT IN': ['pending', 'approved'] });
query.where({ 'status !=': ['pending', 'approved'] });
query.where({ 'status <>': ['pending', 'approved'] });

// the following demonstrates how to use question marks for binding
query.where(
  'users.id IN (SELECT user_id FROM roles WHERE customer_id IN (?, ?))',
  [1, 2]
);
query.where(
  'users.id IN (SELECT user_id FROM roles WHERE customer_id = ?)',
  // even if there is only one placeholder, you must use an array
  [1]
);

// The following demonstrates using objects to specify multiple conditions
query.where({
  deleted_at: null,
  'price >': 100,
  'price <': 200,
  color: ['blue', 'black'],
  'stars BETWEEN': [4, 5],
  conditions: ['new', 'used'],
});

// Note: .having() supports the same signatures as .where()

// The following demonstrate equivalent ways to use OR
query.orWhere([{ approved_at: null }, { denied_at: null }]);
query.orWhere({ approved_at: null, denied_at: null });
query.orWhere(['approved_at IS NULL', 'denied_at IS NULL']);
query.orWhere([
  ['approved_at', null],
  ['denied_at =', null],
]);
query.where('(approved_at IS NULL OR denied_at IS NULL)');

// Note: .orHaving() supports the same signatures as .orWhere()

// The following demonstrate joins
query.innerJoin('phone_numbers p ON p.user_id = u.id');
query.leftJoin('phone_numbers p ON p.user_id = u.id AND p.type = ?', ['main']);
query.outerJoin('phone_numbers p ON p.user_id = u.id AND p.type NOT IN(?, ?)', [
  'home',
  'cell',
]);

// The following demonstrates pagination
query.limit(10).page(3); // LIMIT 10 OFFSET 20

// The following demonstrates cloning
const query1 = new SelectBuilder();
query1.where('email', 'john@example.com');
const query2 = query1.getClone();
query1.table('users');
query2.table('contacts');
query1.compile().sql; // SELECT * FROM users WHERE email = ?
query2.compile().sql; // SELECT * FROM contacts WHERE email = ?
```

### Counting results

One powerful feature of SelectBuilder is that it can construct a count query
to determine the number of results that would have been returned if there were
no LIMIT.

```js
const query = new SelectBuilder('SELECT id, name FROM users LIMIT 5');

const { sql } = query.compileCount();
// SELECT COUNT(*) AS found_rows FROM users

const { sql } = query.compileCount({ countExpr: 'DISTINCT externalId' });
// SELECT COUNT(DISTINCT externalId) AS found_rows FROM users
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

### Parser limitations

`new SelectBuilder(sql)` uses regular expressions and is not a true parser.
The goal is to be fast and useful for 99% of situations.

Below are some limitations illustrated by example.

#### Nested subqueries

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
const subquery = `SELECT id FROM categories WHERE client_id IN(
  SELECT client_id FROM affiliations WHERE name LIKE 'test'
)`;
query.where(`category_id IN(${subquery})`);
```

#### Keywords in strings

If you need to use SQL keywords in strings, use bindings.

```js
// ❌ WILL NOT WORK
new SelectBuilder(`SELECT id, CONCAT('where ', expr) FROM users`);

// ✅ WORKING EQUIVALENT
new SelectBuilder(`SELECT id, CONCAT(:prefix, expr) FROM users`, {
  prefix: 'where ',
});
```

#### Nested OR and AND clauses

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

## Utility functions

There are several utility functions bundled with this library.

### getPagination

You can get detailed page and limit information from a query.

```js
import { SelectBuilder, getPagination } from 'sql-love';

const query = new SelectBuilder('SELECT * FROM users').limit(10).page(1);
// ...
// run a count query to determine that there are 42 results
const pagination = getPagination(query, 42);
expect(pagination).toEqual({
  page: 1,
  prevPage: null,
  nextPage: 2,
  perPage: 10,
  numPages: 5,
  total: 42,
  isFirst: true,
  isLast: false,
});
```

### extractIndexed

You can index a results set by a particular field.

```js
import { extractIndexed } from 'sql-love';

const records = [
  { id: 1, name: 'John' },
  { id: 2, name: 'Jane' },
];
const indexed = extractIndexed('id', records);
/*
{
  1: { id: 1, name: 'John' },
  2: { id: 2, name: 'Jane' },
});
*/
```

### extractGrouped

You can divide a results set into groups based on a particular field.

```js
import { extractGrouped } from 'sql-love';

const records = [
  { id: 1, name: 'John', dept: 'Marketing' },
  { id: 2, name: 'Jane', dept: 'Finance' },
  { id: 3, name: 'Tim', dept: 'Marketing' },
];
const grouped = extractGrouped('dept', records);
/*
{
  Marketing: [
    { id: 1, name: 'John', dept: 'Marketing' },
    { id: 3, name: 'Tim', dept: 'Marketing' },
  ],
  Finance: [{ id: 2, name: 'Jane', dept: 'Finance' }],
}
*/
```

### extractLookup

You can create a lookup object based on a results set

```js
const records = [
  { id: 1, name: 'John', age: 30 },
  { id: 2, name: 'Jane', age: 35 },
];

const nameById = extractLookup('id', 'name', records);
/*
{ 
  '1': 'John',
  '2': 'Jane',
}
*/
```

### runPrisma and runPrismaWithCount

`runPrisma()` will run a query using Prisma and return the results.

```js
import { SelectBuilder, runPrisma } from 'sql-love';
import { prisma } from '~/db.server';

const query = new SelectBuilder('SELECT * FROM users');
query.where('dept', 'Marketing');

const rows = runPrisma(prisma, query, { engine: 'pg' });
```

`runPrismaWithCount()` will run a query using Prisma and return the results,
found rows and pagination.

```js
import { SelectBuilder, runPrismaWithCount } from 'sql-love';
import { prisma } from '~/db.server';

const query = new SelectBuilder('SELECT * FROM users')
  .where('dept', 'Marketing')
  .limit(2)
  .page(5);
const { records, total, pagination } = await runPrismaWithCount(prisma, query, {
  engine: 'pg',
});
```

See [getPagination](#getpagination) for details on the pagination object.

### runMysql and runMysqlWithCount

`runMysql()` will run a query using mysql and return the results.

```js
import { SelectBuilder, runMysql } from 'sql-love';
import { mysql } from 'mysql2';
const client = mysql.createConnection(config);

const query = new SelectBuilder('SELECT * FROM users');
query.where('dept', 'Marketing');

const rows = await runMysql(client, query);
```

`runMysqlWithCount()` will run a query using mysql and return the results,
found rows and pagination.

```js
import { SelectBuilder, runMysqlWithCount } from 'sql-love';
import { mysql } from 'mysql2';
const client = mysql.createConnection(config);

const query = new SelectBuilder('SELECT * FROM users')
  .where('dept', 'Marketing')
  .limit(2)
  .page(5);

const { records, total, pagination } = await runMysqlWithCount(client, query);
```

You can also use the mysql2 promise api:

```js
import { SelectBuilder, runMysqlAsync, runMysqlAsyncWithCount } from 'sql-love';
import { mysql } from 'mysql2/promise';
const client = await mysql.createConnection(config);

const query = new SelectBuilder('SELECT * FROM users')
  .where('dept', 'Marketing')
  .limit(2)
  .page(5);

const records = await runMysqlAsync(client, query);
// OR
const { records, total, pagination } = await runMysqlAsyncWithCount(
  client,
  query
);
```

### toSafeJson

With some database clients such as Prisma, your recordsets may contain BigInt
objects. These are not safe to pass to JSON.stringify(). The following are
examples of the toSafeJson\* utility functions.

```js
import { toSafeJsonString, toSafeJsonRecords } from 'sql-love';

const records = [{ count: 12n }, { count: 9007199254740993n }];

toSafeJsonRecords(records);
// [
//   { count: 12 },
//   { count: "9007199254740993" },
// ]

toSafeJsonString(records);
// '[{"count":12},{"count":"9007199254740993"}]'

// Note that BigInt values too big for Number are converted to strings
```
