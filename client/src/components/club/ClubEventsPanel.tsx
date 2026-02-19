import { Link } from "wouter";
import { CalendarClock, ExternalLink, MapPin } from "lucide-react";

interface ClubEventsPanelProps {
  clubId: number;
  events: any[];
  variant?: "stickyDesktop" | "inlineFeed";
  className?: string;
}

function formatEventLabel(startTime: string) {
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
  clubId,
  events,
  variant = "inlineFeed",
  className,
}: ClubEventsPanelProps) {
  if (!events.length && variant === "inlineFeed") return null;

  const rootClassName =
    variant === "stickyDesktop"
      ? "surface-panel h-full p-3"
      : "surface-panel p-3";

  return (
    <section className={`${rootClassName} ${className ?? ""}`.trim()} aria-label="Eventi del club">
      <div className="mb-2 flex items-center justify-between">
        <p className="inline-flex items-center gap-2 text-xs font-display uppercase tracking-wide text-muted-foreground">
          <CalendarClock className="h-4 w-4 text-primary" />
          Eventi in programma
        </p>
        <span className="text-xs text-muted-foreground">{events.length}</span>
      </div>

      {events.length === 0 ? (
        <div className="rounded-xl border border-border/60 bg-card/30 px-3 py-4 text-xs text-muted-foreground">
          Nessun evento in programma
        </div>
      ) : (
        <div className={variant === "stickyDesktop" ? "space-y-2" : "max-h-44 space-y-2 overflow-y-auto pr-1"}>
          {events.map((eventItem: any) => {
            const event = eventItem.event ?? eventItem;
            return (
              <Link
                key={event.id}
                href={`/community/club/${clubId}/event/${event.id}`}
                className="flex items-center justify-between rounded-xl border border-border/60 bg-card/40 px-3 py-2 transition-colors hover:bg-card/60"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{event.title}</p>
                  <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{formatEventLabel(event.startTime)}</span>
                    {event.location ? (
                      <span className="inline-flex items-center gap-1 truncate">
                        <MapPin className="h-3 w-3" />
                        {event.location}
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
