import type { ReactNode } from "react";
import { Link } from "wouter";
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
  /** Layout of the placeholders, replacing the default stacked list (`space-y-2`). */
  className?: string;
  itemClassName?: string;
}) {
  return (
    <div role="status" className={className ?? "space-y-2"}>
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

/**
 * An answer that is not data («Profilo non trovato.», «Questo profilo è privato.»): a short
 * message in a card, with an optional link back.
 */
export function Notice({
  children,
  backHref,
  backLabel,
  className,
}: {
  children: ReactNode;
  backHref?: string;
  backLabel?: string;
  className?: string;
}) {
  return (
    <div className={cn("surface-panel p-4 text-center", className)}>
      <p className="text-sm text-muted-foreground">{children}</p>
      {backHref && backLabel ? (
        <Button variant="outline" className="mt-3" asChild>
          <Link href={backHref}>{backLabel}</Link>
        </Button>
      ) : null}
    </div>
  );
}
