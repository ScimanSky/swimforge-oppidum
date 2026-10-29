import { formatPaceValue } from "@/lib/format";
import { cn } from "@/lib/utils";

export type PaceRow = { number: number; pace: number | null | undefined };
export type PaceBar = { number: number; pace: number; height: number; fastest: boolean };

/** The slowest bar is this tall (percent), the fastest 100. */
const MIN_HEIGHT = 35;

/**
 * Bars for «Passo per ripetuta»: one per row with a valid pace (s/100 m), taller when faster,
 * the fastest (the first on a tie) marked. Null with fewer than two valid rows.
 */
export function paceBars(rows: readonly PaceRow[]): PaceBar[] | null {
  const valid = rows.filter(
    (row): row is { number: number; pace: number } =>
      typeof row.pace === "number" && Number.isFinite(row.pace) && row.pace > 0
  );
  if (valid.length < 2) return null;
  const speeds = valid.map(row => 100 / row.pace);
  const slowest = Math.min(...speeds);
  const fastest = Math.max(...speeds);
  const fastestIndex = speeds.indexOf(fastest);
  return valid.map((row, index) => ({
    number: row.number,
    pace: row.pace,
    height:
      fastest === slowest
        ? 100
        : Math.round(MIN_HEIGHT + ((100 - MIN_HEIGHT) * (speeds[index] - slowest)) / (fastest - slowest)),
    fastest: index === fastestIndex,
  }));
}

/**
 * Corsia pace chart (`renders/Sessione.png`): plain bars on `--chart-1`, the fastest at full
 * colour, the others muted; under it first and last repeat and the fastest as text, which is
 * also the text alternative (the bars are decorative).
 */
export function PaceBars({ bars }: { bars: readonly PaceBar[] }) {
  const best = bars.find(bar => bar.fastest) ?? bars[0];
  return (
    <div>
      <div
        className={cn("flex h-32 items-end", bars.length > 20 ? "gap-px" : "gap-1.5")}
        aria-hidden
      >
        {bars.map(bar => (
          <div
            key={bar.number}
            title={`Rip. ${bar.number} · ${formatPaceValue(bar.pace)}${bar.fastest ? " · la più veloce" : ""}`}
            className={cn(
              "min-w-0 flex-1 rounded-t-md",
              bar.fastest ? "bg-chart-1" : "bg-chart-1/35"
            )}
            style={{ height: `${bar.height}%` }}
          />
        ))}
      </div>
      <p className="mt-3 flex justify-between gap-2 text-xs text-muted-foreground tabular-nums">
        <span aria-hidden>Rip. {bars[0].number}</span>
        <span className="font-semibold text-foreground">
          Più veloce: rip. {best.number} · {formatPaceValue(best.pace)}
        </span>
        <span aria-hidden>{bars[bars.length - 1].number}</span>
      </p>
    </div>
  );
}
