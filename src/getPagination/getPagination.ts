import type SelectBuilder from '../SelectBuilder/SelectBuilder';

/**
 * Given a foundRows number of records and a limit, return the foundRows number of pages
 * @param query  The query that was just run
 * @param total  The number of records if there were no limit
 */
export default function getPagination(
  query: SelectBuilder,
  total: BigInt | number
) {
  total = Number(total) || 0;
  const page = Number(query._page) || 1;
  const perPage = Number(query._limit);
  const numPages = Math.ceil(total / perPage) || 0;
  const isFirst = page === 1;
  const isLast = page === numPages;
  const prevPage = page - 1 || null;
  const nextPage = page + 1 <= numPages ? page + 1 : null;
  return {
    page,
    prevPage,
    nextPage,
    perPage,
    numPages,
    total,
    isFirst,
    isLast,
  };
}
