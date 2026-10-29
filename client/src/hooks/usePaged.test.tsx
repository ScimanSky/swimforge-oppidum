import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { usePaged, type PageResetKey } from "./usePaged";

const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe("usePaged", () => {
  afterEach(cleanup);

  it("divide la lista in pagine e dà l'offset", () => {
    const { result } = renderHook(() => usePaged(range(7), 3));
    expect(result.current).toMatchObject({ page: 1, totalPages: 3, offset: 0, pageItems: [1, 2, 3] });
    act(() => result.current.setPage(3));
    expect(result.current).toMatchObject({ page: 3, offset: 6, pageItems: [7] });
  });

  it("almeno una pagina con la lista vuota", () => {
    const { result } = renderHook(() => usePaged([], 4));
    expect(result.current).toMatchObject({ page: 1, totalPages: 1, offset: 0, pageItems: [] });
  });

  it("non va oltre l'ultima pagina né sotto la prima", () => {
    const { result } = renderHook(() => usePaged(range(5), 2));
    act(() => result.current.setPage(9));
    expect(result.current.page).toBe(3);
    act(() => result.current.setPage(0));
    expect(result.current.page).toBe(1);
  });

  it("se la lista si accorcia resta sull'ultima pagina piena", () => {
    const { result, rerender } = renderHook(({ items }) => usePaged(items, 2), {
      initialProps: { items: range(6) },
    });
    act(() => result.current.setPage(3));
    rerender({ items: range(4) });
    expect(result.current).toMatchObject({ page: 2, pageItems: [3, 4] });
    // The clamp sticks: the list growing again does not jump back to page 3.
    rerender({ items: range(6) });
    expect(result.current.page).toBe(2);
  });

  it("se cresce la dimensione della pagina resta su una pagina valida", () => {
    const { result, rerender } = renderHook(({ size }) => usePaged(range(6), size), {
      initialProps: { size: 2 },
    });
    act(() => result.current.setPage(3));
    rerender({ size: 4 });
    expect(result.current).toMatchObject({ page: 2, totalPages: 2, pageItems: [5, 6] });
  });

  // Checked by `pnpm check` (this file is .tsx so tsc includes it): an object key fails to compile.
  it("accetta come chiavi solo valori primitivi", () => {
    const keys: PageResetKey[] = ["all", 3, true, null, undefined];
    // @ts-expect-error an object built during render is a new key on every render.
    const objectKeys: PageResetKey[] = [{ filter: "all" }];
    // @ts-expect-error same for an array.
    const arrayKeys: PageResetKey[] = [["all"]];
    expect([keys, objectKeys, arrayKeys].map((list) => list.length)).toEqual([5, 1, 1]);
  });

  it("torna alla prima pagina quando cambia una chiave", () => {
    const { result, rerender } = renderHook(({ filter }) => usePaged(range(9), 3, [filter]), {
      initialProps: { filter: "all" },
    });
    act(() => result.current.setPage(3));
    rerender({ filter: "all" });
    expect(result.current.page).toBe(3);
    rerender({ filter: "week" });
    expect(result.current).toMatchObject({ page: 1, pageItems: [1, 2, 3] });
  });
});
