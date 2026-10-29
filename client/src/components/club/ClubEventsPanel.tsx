import { useId } from "react";
import { Link } from "wouter";
import { CalendarClock, ChevronRight, Flag, MapPin, Trophy } from "lucide-react";
import { formatSessionDate, NO_VALUE } from "@/lib/format";

export type ClubAgendaItem = {
  id: string;
  title: string;
  href: string;
  startsAtIso: string | null;
  location?: string | null;
  kind: "event" | "meet";
  statusLabel?: string | null;
};

interface ClubEventsPanelProps {
  items: ClubAgendaItem[];
  className?: string;
}

/** Upcoming club events and meets: one row per item, linking to its page. */
export default function ClubEventsPanel({ items, className }: ClubEventsPanelProps) {
  const titleId = useId();

  return (
    <section aria-labelledby={titleId} className={`surface-panel p-4 ${className ?? ""}`.trim()}>
      <div className="flex items-center justify-between gap-3">
        <h3 id={titleId} className="inline-flex items-center gap-2 text-[17px] font-bold">
          <CalendarClock className="size-4 text-action-text" aria-hidden />
          Gare ed eventi
        </h3>
        <span className="text-sm text-muted-foreground tabular-nums">{items.length}</span>
      </div>

      {items.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Nessuna gara o evento in programma.</p>
      ) : (
        <ul className="mt-2">
          {items.map((item) => {
            const date = formatSessionDate(item.startsAtIso);
            return (
              <li key={item.id} className="border-t border-border first:border-t-0">
                <Link
                  href={item.href}
                  className="flex items-center gap-3 py-3 transition-colors hover:text-action-text"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{item.title}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      {date !== NO_VALUE ? <span>{date}</span> : null}
                      {item.location ? (
                        <span className="inline-flex min-w-0 items-center gap-1">
                          <MapPin className="size-3.5 shrink-0" aria-hidden />
                          <span className="truncate">{item.location}</span>
                        </span>
                      ) : null}
                      {item.statusLabel ? (
                        <span className="inline-flex items-center gap-1">
                          {item.kind === "meet" ? (
                            <Flag className="size-3.5" aria-hidden />
                          ) : (
                            <Trophy className="size-3.5" aria-hidden />
                          )}
                          {item.statusLabel}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
