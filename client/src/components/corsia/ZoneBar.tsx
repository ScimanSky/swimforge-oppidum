import { cn } from "@/lib/utils";

export type ZoneShare = {
  zone: number;
  seconds: number;
  percent: number;
  dominant: boolean;
};

/** Literal classes so Tailwind generates them. */
const ZONE_BG = ["bg-zone-1", "bg-zone-2", "bg-zone-3", "bg-zone-4", "bg-zone-5"];

const positive = (value: number | null | undefined) => {
  const number = Number(value ?? 0);
  return Number.isFinite(number) && number > 0 ? number : 0;
};

/**
 * Seconds in zones 1-5 → integer percentages summing to 100 (largest remainder), the zone
 * with the most time marked dominant (the lower one on a tie). Null without any time.
 */
export function zoneShares(
  seconds: readonly (number | null | undefined)[]
): ZoneShare[] | null {
  return sharesOf(ZONE_BG.map((_, index) => seconds[index]));
}

/** zoneShares for any number of parts (e.g. the seven pace zones A1–C3). */
export function sharesOf(amounts: readonly (number | null | undefined)[]): ZoneShare[] | null {
  const values = amounts.map(positive);
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return null;
  const exact = values.map(value => (value * 100) / total);
  const percents = exact.map(Math.floor);
  let missing = 100 - percents.reduce((sum, value) => sum + value, 0);
  const byRemainder = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const { index } of byRemainder) {
    if (missing <= 0) break;
    percents[index] += 1;
    missing -= 1;
  }
  const dominantIndex = values.indexOf(Math.max(...values));
  return values.map((value, index) => ({
    zone: index + 1,
    seconds: value,
    percent: percents[index],
    dominant: index === dominantIndex,
  }));
}

/**
 * Corsia cardio zones (`renders/Sessione.png`): one bar split by time in zone with the
 * `--zone-*` palette, percentages below, the dominant zone in `<strong>` and announced as
 * «prevalente». Renders nothing without zone data. The bar is decorative: the percentages are
 * the text alternative. With `names` (one per zone) the legend reads «Z1 Recupero 12%» and
 * wraps on narrow screens instead of spreading across one line.
 */
export function ZoneBar({
  seconds,
  names,
  className,
}: {
  seconds: readonly (number | null | undefined)[];
  names?: readonly string[];
  className?: string;
}) {
  const shares = zoneShares(seconds);
  if (!shares) return null;
  return (
    <div className={className}>
      <div className="flex h-3 gap-1" aria-hidden>
        {shares
          .filter(share => share.seconds > 0)
          .map(share => (
            <div
              key={share.zone}
              className={cn("min-w-1 basis-0 rounded-full", ZONE_BG[share.zone - 1])}
              style={{ flexGrow: share.seconds }}
            />
          ))}
      </div>
      <ul
        className={cn(
          "mt-3 flex text-xs tabular-nums",
          names ? "flex-wrap gap-x-4 gap-y-1" : "justify-between gap-2"
        )}
      >
        {shares.map(share => {
          const label = (
            <>
              <abbr title={`Zona ${share.zone}`} className="no-underline">
                Z{share.zone}
              </abbr>{" "}
              {names?.[share.zone - 1] ? `${names[share.zone - 1]} ` : null}
              {share.percent}%
            </>
          );
          return (
            <li key={share.zone} className="whitespace-nowrap text-muted-foreground">
              {share.dominant ? (
                <strong className="font-bold text-foreground">
                  {label}
                  <span className="sr-only">, prevalente</span>
                </strong>
              ) : (
                label
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
