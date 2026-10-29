import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Pager } from "./Pager";

function Harness({
  total = 3,
  onScroll,
  listTop = -200,
}: {
  total?: number;
  onScroll?: () => void;
  /** Where the list top is in the viewport (negative: scrolled past it). */
  listTop?: number;
}) {
  const [page, setPage] = useState(1);
  const listRef = useRef<HTMLUListElement>(null);
  return (
    <>
      <ul
        ref={(node) => {
          listRef.current = node;
          if (node) {
            node.scrollIntoView = onScroll ?? (() => {});
            node.getBoundingClientRect = () => ({ top: listTop }) as DOMRect;
          }
        }}
      />
      <Pager page={page} totalPages={total} onChange={setPage} listRef={listRef} label="Pagine" />
    </>
  );
}

describe("Pager", () => {
  afterEach(cleanup);

  it("annuncia «Pagina X di Y» in una regione live", async () => {
    const user = userEvent.setup({ delay: null });
    render(<Harness />);
    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.textContent).toBe("Pagina 1 di 3");
    await user.click(screen.getByRole("button", { name: "Avanti" }));
    expect(screen.getByRole("status").textContent).toBe("Pagina 2 di 3");
  });

  it("ai bordi i pulsanti restano focalizzabili ma non fanno nulla", async () => {
    const user = userEvent.setup({ delay: null });
    const onChange = vi.fn();
    render(<Pager page={1} totalPages={2} onChange={onChange} />);
    const back = screen.getByRole("button", { name: "Indietro" });
    expect(back.hasAttribute("disabled")).toBe(false);
    expect(back.getAttribute("aria-disabled")).toBe("true");
    await user.click(back);
    expect(onChange).not.toHaveBeenCalled();
    back.focus();
    expect(document.activeElement).toBe(back);
  });

  it("l'ultima pagina tiene il fuoco su «Avanti» e lo disattiva", async () => {
    const user = userEvent.setup({ delay: null });
    render(<Harness total={2} />);
    const next = screen.getByRole("button", { name: "Avanti" });
    await user.click(next);
    expect(document.activeElement).toBe(next);
    expect(next.getAttribute("aria-disabled")).toBe("true");
    await user.click(next);
    expect(screen.getByRole("status").textContent).toBe("Pagina 2 di 2");
  });

  it("dopo il cambio pagina riporta in vista l'inizio della lista", async () => {
    const user = userEvent.setup({ delay: null });
    const onScroll = vi.fn();
    render(<Harness onScroll={onScroll} />);
    await user.click(screen.getByRole("button", { name: "Avanti" }));
    expect(onScroll).toHaveBeenCalledTimes(1);
  });

  it("una lista già in vista non scorre", async () => {
    const user = userEvent.setup({ delay: null });
    const onScroll = vi.fn();
    render(<Harness onScroll={onScroll} listTop={120} />);
    await user.click(screen.getByRole("button", { name: "Avanti" }));
    expect(screen.getByRole("status").textContent).toBe("Pagina 2 di 3");
    expect(onScroll).not.toHaveBeenCalled();
  });

  it("niente con una sola pagina", () => {
    const { container } = render(<Pager page={1} totalPages={1} onChange={() => {}} />);
    expect(container.innerHTML).toBe("");
  });
});
