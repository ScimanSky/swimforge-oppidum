import { Link } from "wouter";
import { CalendarClock, ExternalLink, Flag, MapPin, Trophy } from "lucide-react";

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
  variant?: "stickyDesktop" | "inlineFeed";
  className?: string;
}

function formatEventLabel(startTime?: string | null) {
  if (!startTime) return "Data non disponibile";
  const eventDate = new Date(startTime);
  if (Number.isNaN(eventDate.getTime())) return "Data non valida";
  return eventDate.toLocaleDateString("it-IT", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ClubEventsPanel({
  items,
  variant = "inlineFeed",
  className,
}: ClubEventsPanelProps) {
  if (!items.length && variant === "inlineFeed") return null;

  const rootClassName =
    variant === "stickyDesktop"
      ? "surface-panel h-full p-3"
      : "surface-panel p-3";

  return (
    <section className={`${rootClassName} ${className ?? ""}`.trim()} aria-label="Eventi del club">
      <div className="mb-2 flex items-center justify-between">
        <p className="inline-flex items-center gap-2 text-xs font-display uppercase tracking-wide text-muted-foreground">
          <CalendarClock className="h-4 w-4 text-primary" />
          Gare ed Eventi
        </p>
        <span className="text-xs text-muted-foreground">{items.length}</span>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-border/60 bg-card/30 px-3 py-4 text-xs text-muted-foreground">
          Nessuna gara o evento in programma
        </div>
      ) : (
        <div className={variant === "stickyDesktop" ? "space-y-2" : "max-h-44 space-y-2 overflow-y-auto pr-1"}>
          {items.map((item) => {
            return (
              <Link
                key={item.id}
                href={item.href}
                className="flex items-center justify-between rounded-xl border border-border/60 bg-card/40 px-3 py-2 transition-colors hover:bg-card/60"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{item.title}</p>
                  <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{formatEventLabel(item.startsAtIso)}</span>
                    {item.location ? (
                      <span className="inline-flex items-center gap-1 truncate">
                        <MapPin className="h-3 w-3" />
                        {item.location}
                      </span>
                    ) : null}
                    {item.statusLabel ? (
                      <span className="inline-flex items-center gap-1 truncate">
                        {item.kind === "meet" ? <Flag className="h-3 w-3" /> : <Trophy className="h-3 w-3" />}
                        {item.statusLabel}
                      </span>
                    ) : null}
                  </div>
                </div>
                <ExternalLink className="ml-3 h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
