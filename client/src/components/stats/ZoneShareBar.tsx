import { sharesOf } from "@/components/corsia/ZoneBar";
import type { ZoneShareItem } from "@/lib/swim-metrics-view";

/**
 * Metres per pace zone (or level) as one bar of `--pace-*` fills, and below it the legend as
 * text: «A1 Recupero attivo 30%», the largest part in bold and announced as «prevalente». The bar
 * is decorative (the list is its text) and colour is never the only cue. Nothing without metres.
 */
export function ZoneShareBar({ items, label }: { items: ZoneShareItem[]; label: string }) {
  const shares = sharesOf(items.map((item) => item.meters));
  if (!shares) return null;
  return (
    <div>
      <div className="flex h-3 gap-1" aria-hidden>
        {shares.map((share, index) =>
          share.seconds > 0 ? (
            <div
              key={items[index].key}
              className="min-w-1 basis-0 rounded-full"
              style={{ flexGrow: share.seconds, background: items[index].color }}
            />
          ) : null
        )}
      </div>
      <ul aria-label={label} className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs tabular-nums">
        {shares.map((share, index) => {
          const item = items[index];
          const text = (
            <>
              <span aria-hidden className="mr-1.5 inline-block size-2.5 rounded-sm align-[-1px]" style={{ background: item.color }} />
              {item.label} {share.percent}%
            </>
          );
          return (
            <li key={item.key} className="whitespace-nowrap text-muted-foreground">
              {share.dominant ? (
                <strong className="font-bold text-foreground">
                  {text}
                  <span className="sr-only">, prevalente</span>
                </strong>
              ) : (
                text
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
