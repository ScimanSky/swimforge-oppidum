import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** «Pagina 2 di 5» with Indietro / Avanti; renders nothing with a single page. */
export function Pager({
  page,
  totalPages,
  onChange,
  label = "Pagine",
  className,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  /** Accessible name of the navigation landmark («Pagine dei club»). */
  label?: string;
  className?: string;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav
      aria-label={label}
      className={cn("flex items-center justify-between gap-3", className)}
    >
      <p className="text-sm text-muted-foreground tabular-nums">
        Pagina {page} di {totalPages}
      </p>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => onChange(Math.max(1, page - 1))}
          disabled={page <= 1}
        >
          Indietro
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
        >
          Avanti
        </Button>
      </div>
    </nav>
  );
}
