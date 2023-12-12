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
  const perPage = Number(query._limit) || null;
  let page: number | null = null;
  if (total === 0) {
    page = null;
  } else if (query._page) {
    page = Number(query._page);
  } else if (query._limit && query._offset) {
    page = Math.floor(Number(query._offset) / Number(query._limit)) + 1;
  } else if (query._limit && !query._offset) {
    page = 1;
  } else {
    page = null;
  }
  const numPages =
    total === 0 || perPage === null ? 0 : Math.ceil(total / perPage) || 0;
  const isFirst = page === 1;
  const isLast = numPages > 0 && page === numPages;
  const prevPage = numPages === 0 ? null : page - 1 || null;
  const nextPage = numPages > 0 && page + 1 <= numPages ? page + 1 : null;
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
