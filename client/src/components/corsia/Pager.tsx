import type { RefObject } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Brings the top of the paged list back into view when it scrolled above the viewport (or under
 * the fixed header, via the list's `scroll-margin-top` plus the page's `scroll-padding-top`, the
 * status bar of the native app); a list already in view does not move.
 */
function revealListTop(list: HTMLElement | null | undefined) {
  if (!list) return;
  const px = (value: string) => Number.parseFloat(value) || 0;
  const margin =
    px(window.getComputedStyle(list).scrollMarginTop) +
    px(window.getComputedStyle(document.documentElement).scrollPaddingTop);
  if (list.getBoundingClientRect().top >= margin) return;
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  list.scrollIntoView?.({ block: "start", behavior: reduceMotion ? "auto" : "smooth" });
}

/**
 * «Pagina 2 di 5» with Indietro / Avanti; renders nothing with a single page. The page line is a
 * polite live region, and at the ends the buttons stay focusable (`aria-disabled`, not
 * `disabled`) so focus is not dropped on the last page.
 */
export function Pager({
  page,
  totalPages,
  onChange,
  label = "Pagine",
  listRef,
  className,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  /** Accessible name of the navigation landmark («Pagine dei club»). */
  label?: string;
  /** The paged list (or its section): scrolled back into view after a page change. */
  listRef?: RefObject<HTMLElement | null>;
  className?: string;
}) {
  if (totalPages <= 1) return null;
  const atStart = page <= 1;
  const atEnd = page >= totalPages;
  const go = (next: number) => {
    onChange(next);
    revealListTop(listRef?.current);
  };
  const edgeClass = "aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-transparent";
  return (
    <nav
      aria-label={label}
      className={cn("flex items-center justify-between gap-3", className)}
    >
      <p role="status" aria-live="polite" className="text-sm text-muted-foreground tabular-nums">
        Pagina {page} di {totalPages}
      </p>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          aria-disabled={atStart || undefined}
          className={edgeClass}
          onClick={() => {
            if (!atStart) go(page - 1);
          }}
        >
          Indietro
        </Button>
        <Button
          size="sm"
          variant="outline"
          aria-disabled={atEnd || undefined}
          className={edgeClass}
          onClick={() => {
            if (!atEnd) go(page + 1);
          }}
        >
          Avanti
        </Button>
      </div>
    </nav>
  );
}
