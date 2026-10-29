import { useCallback, useState } from "react";

const sameKeys = (a: readonly unknown[], b: readonly unknown[]) =>
  a.length === b.length && a.every((key, index) => Object.is(key, b[index]));

/**
 * Client-side paging of `items`: the current page's slice and the 0-based offset of its first
 * item. The page is always valid: it is clamped when the list shrinks or the page size grows
 * (no empty page after leaving the last challenge), and goes back to 1 when any of
 * `resetKeys` changes (a new filter or search).
 */
export function usePaged<T>(
  items: readonly T[],
  pageSize: number,
  resetKeys: readonly unknown[] = []
) {
  const size = Math.max(1, Math.floor(pageSize) || 1);
  const totalPages = Math.max(1, Math.ceil(items.length / size));
  const [storedPage, setStoredPage] = useState(1);
  const [lastKeys, setLastKeys] = useState<readonly unknown[]>(resetKeys);

  // Adjusted during render (React's «storing information from previous renders» pattern):
  // the very first paint after the change is already right, with no effect and no flash.
  let page = storedPage;
  if (!sameKeys(lastKeys, resetKeys)) {
    setLastKeys(resetKeys);
    page = 1;
  }
  page = Math.min(Math.max(1, page), totalPages);
  if (page !== storedPage) setStoredPage(page);

  const setPage = useCallback((next: number) => {
    setStoredPage(Number.isFinite(next) ? Math.max(1, Math.floor(next)) : 1);
  }, []);

  const offset = (page - 1) * size;
  return { page, setPage, totalPages, offset, pageItems: items.slice(offset, offset + size) };
}
