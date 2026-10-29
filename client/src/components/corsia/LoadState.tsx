import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Grey placeholders while data loads, announced once as `label` («Caricamento della
 * classifica…»): never an empty state that later turns out to be wrong.
 */
export function LoadingSkeleton({
  label,
  count = 4,
  className,
  itemClassName = "h-16 w-full rounded-2xl",
}: {
  label: string;
  count?: number;
  /** Layout of the placeholders (default: a stacked list). */
  className?: string;
  itemClassName?: string;
}) {
  return (
    <div role="status" className={cn("space-y-2", className)}>
      <span className="sr-only">{label}</span>
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} className={itemClassName} aria-hidden />
      ))}
    </div>
  );
}

/** A query that failed (and has nothing to show): short message and «Riprova». */
export function LoadError({ onRetry, className }: { onRetry: () => void; className?: string }) {
  return (
    <div
      role="alert"
      className={cn("surface-panel flex items-center justify-between gap-3 p-4", className)}
    >
      <p className="text-sm text-muted-foreground">Non riesco a caricare i dati</p>
      <Button size="sm" variant="outline" onClick={onRetry}>
        Riprova
      </Button>
    </div>
  );
}
