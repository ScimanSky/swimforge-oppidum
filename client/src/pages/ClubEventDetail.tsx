import AppLayout from "@/components/AppLayout";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Surface, SurfaceContent, SurfaceHeader, SurfaceTitle } from "@/components/ui/surface";
import { Badge } from "@/components/ui/badge";
import { MetricOrb } from "@/components/metrics/MetricOrb";
import { trpc } from "@/lib/trpc";
import { Calendar, CheckCircle2, HelpCircle, MapPin, Users, XCircle } from "lucide-react";
import { useMemo } from "react";
import { Link, useRoute } from "wouter";

type EventRsvpStatus = "going" | "maybe" | "not_going";

const formatDateTime = (value: unknown): string => {
  if (!value) return "";
  const date = new Date(value as any);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("it-IT", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function ClubEventDetail() {
  const [match, params] = useRoute("/community/club/:clubId/event/:eventId");
  const clubId = Number(params?.clubId);
  const eventId = Number(params?.eventId);

  const utils = trpc.useUtils();

  const clubQuery = trpc.community.clubs.get.useQuery(
    { clubId },
    { enabled: match && Number.isFinite(clubId) }
  );

  const eventQuery = trpc.community.clubs.events.get.useQuery(
    { eventId },
    { enabled: match && Number.isFinite(eventId) }
  );

  const attendeesQuery = trpc.community.clubs.events.attendees.useQuery(
    { eventId },
    { enabled: match && Number.isFinite(eventId) }
  );

  const rsvpMutation = trpc.community.clubs.events.rsvp.useMutation({
    onSuccess: () => {
      utils.community.clubs.events.attendees.invalidate({ eventId });
      utils.community.clubs.events.list.invalidate();
    },
  });

  const deleteEvent = trpc.community.clubs.events.delete.useMutation({
    onSuccess: () => {
      utils.community.clubs.events.list.invalidate();
      window.location.href = `/community/club/${clubId}`;
    },
  });

  const attendees = useMemo(() => (attendeesQuery.data as any[]) || [], [attendeesQuery.data]);
  const going = attendees.filter((a) => a.status === "going");
  const maybe = attendees.filter((a) => a.status === "maybe");
  const notGoing = attendees.filter((a) => a.status === "not_going");

  const currentUserId = trpc.profile.get.useQuery().data?.userId;
  const myStatus = attendees.find((a) => a.user?.id === currentUserId)?.status as
    | EventRsvpStatus
    | undefined;

  const club = clubQuery.data as any | undefined;
  const isStaff =
    club?.member_role && ["owner", "admin", "moderator"].includes(club.member_role);

  const event = (eventQuery.data as any)?.event ?? (eventQuery.data as any)?.event ?? eventQuery.data;
  const title = event?.title ?? "Evento";

  if (!match || !Number.isFinite(clubId) || !Number.isFinite(eventId)) {
    return null;
  }

  return (
    <AppLayout className="text-foreground">
      <div className="container py-10 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-1">
            <Link
              href={`/community/club/${clubId}`}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Torna al club
            </Link>
            <h1 className="text-2xl font-display font-bold neon-gradient-text">
              {title}
            </h1>
          </div>
          {isStaff && (
            <Button
              variant="destructive"
              onClick={() => deleteEvent.mutate({ eventId })}
              disabled={deleteEvent.isPending}
            >
              Elimina evento
            </Button>
          )}
        </div>

        <Surface className="border-border/50 bg-card/60 backdrop-blur-sm">
          <SurfaceHeader>
            <SurfaceTitle className="font-display">Dettagli</SurfaceTitle>
          </SurfaceHeader>
          <SurfaceContent className="space-y-3">
            <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                <span>{formatDateTime(event?.startTime)}</span>
                {event?.endTime ? <span> - {formatDateTime(event.endTime)}</span> : null}
              </div>
              {event?.location ? (
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  <span>{event.location}</span>
                </div>
              ) : null}
            </div>
            {event?.description ? (
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {event.description}
              </p>
            ) : null}

            <div className="grid grid-cols-2 gap-3 pt-2 lg:grid-cols-4">
              {[
                {
                  label: "Partecipo",
                  value: going.length,
                  progress: Math.min(100, Math.round((going.length / Math.max(attendees.length, 1)) * 100)),
                  helper: "Confermati",
                  icon: <CheckCircle2 className="h-4 w-4" />,
                  tone: "lime" as const,
                },
                {
                  label: "Forse",
                  value: maybe.length,
                  progress: Math.min(100, Math.round((maybe.length / Math.max(attendees.length, 1)) * 100)),
                  helper: "In dubbio",
                  icon: <HelpCircle className="h-4 w-4" />,
                  tone: "amber" as const,
                },
                {
                  label: "Non partecipo",
                  value: notGoing.length,
                  progress: Math.min(100, Math.round((notGoing.length / Math.max(attendees.length, 1)) * 100)),
                  helper: "Assenti",
                  icon: <XCircle className="h-4 w-4" />,
                  tone: "coral" as const,
                },
                {
                  label: "RSVP totali",
                  value: attendees.length,
                  progress: Math.min(100, Math.round((attendees.length / 40) * 100)),
                  helper: "Partecipazione",
                  icon: <Users className="h-4 w-4" />,
                  tone: "cyan" as const,
                },
              ].map((item) => (
                <MetricOrb
                  key={item.label}
                  label={item.label}
                  value={item.value}
                  progress={item.progress}
                  helper={item.helper}
                  icon={item.icon}
                  tone={item.tone}
                  size="sm"
                />
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-2">
              <Button
                size="sm"
                variant={myStatus === "going" ? "neon" : "outline-neon"}
                onClick={() => rsvpMutation.mutate({ eventId, status: "going" })}
                disabled={rsvpMutation.isPending}
              >
                <CheckCircle2 className="h-4 w-4 mr-1" /> Partecipo ({going.length})
              </Button>
              <Button
                size="sm"
                variant={myStatus === "maybe" ? "neon" : "outline-neon"}
                onClick={() => rsvpMutation.mutate({ eventId, status: "maybe" })}
                disabled={rsvpMutation.isPending}
              >
                <HelpCircle className="h-4 w-4 mr-1" /> Forse ({maybe.length})
              </Button>
              <Button
                size="sm"
                variant={myStatus === "not_going" ? "destructive" : "outline-neon"}
                onClick={() => rsvpMutation.mutate({ eventId, status: "not_going" })}
                disabled={rsvpMutation.isPending}
              >
                <XCircle className="h-4 w-4 mr-1" /> Non partecipo ({notGoing.length})
              </Button>
            </div>
          </SurfaceContent>
        </Surface>

        <Surface className="border-border/50 bg-card/60 backdrop-blur-sm">
          <SurfaceHeader>
            <SurfaceTitle className="font-display">Partecipanti</SurfaceTitle>
          </SurfaceHeader>
          <SurfaceContent className="space-y-6">
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                <Badge variant="outline">Partecipo ({going.length})</Badge>
              </div>
              {going.length === 0 ? (
                <div className="text-sm text-muted-foreground">Nessuno ancora.</div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {going.map((attendee) => (
                    <div key={attendee.id} className="flex items-center gap-3 rounded-lg border border-border bg-background/60 p-3">
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={attendee.user?.profilePicture || undefined} />
                        <AvatarFallback>
                          {(attendee.user?.username?.[0] || "U").toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">
                          {attendee.user?.username || "Utente"}
                        </div>
                        {attendee.user?.fullName ? (
                          <div className="text-xs text-muted-foreground truncate">
                            {attendee.user.fullName}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                <Badge variant="outline">Forse ({maybe.length})</Badge>
              </div>
              {maybe.length === 0 ? (
                <div className="text-sm text-muted-foreground">Nessuno ancora.</div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {maybe.map((attendee) => (
                    <div key={attendee.id} className="flex items-center gap-3 rounded-lg border border-border bg-background/60 p-3">
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={attendee.user?.profilePicture || undefined} />
                        <AvatarFallback>
                          {(attendee.user?.username?.[0] || "U").toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">
                          {attendee.user?.username || "Utente"}
                        </div>
                        {attendee.user?.fullName ? (
                          <div className="text-xs text-muted-foreground truncate">
                            {attendee.user.fullName}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                <Badge variant="outline">Non partecipo ({notGoing.length})</Badge>
              </div>
              {notGoing.length === 0 ? (
                <div className="text-sm text-muted-foreground">Nessuno ancora.</div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {notGoing.map((attendee) => (
                    <div key={attendee.id} className="flex items-center gap-3 rounded-lg border border-border bg-background/60 p-3">
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={attendee.user?.profilePicture || undefined} />
                        <AvatarFallback>
                          {(attendee.user?.username?.[0] || "U").toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">
                          {attendee.user?.username || "Utente"}
                        </div>
                        {attendee.user?.fullName ? (
                          <div className="text-xs text-muted-foreground truncate">
                            {attendee.user.fullName}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </SurfaceContent>
        </Surface>
      </div>
    </AppLayout>
  );
}
