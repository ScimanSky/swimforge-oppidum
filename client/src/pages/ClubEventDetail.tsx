import AppLayout from "@/components/AppLayout";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Surface, SurfaceContent, SurfaceHeader, SurfaceTitle } from "@/components/ui/surface";
import { Badge } from "@/components/ui/badge";
import { MetricOrb } from "@/components/metrics/MetricOrb";
import EventMapEditor from "@/components/club/EventMapEditor";
import { parseRouteGeojson, pointsToRouteGeojson, routeDistanceMeters, routeGeojsonToPoints, type RoutePoint } from "@/lib/club-event-map";
import { trpc } from "@/lib/trpc";
import { Calendar, CheckCircle2, HelpCircle, MapPin, Pencil, RefreshCw, Save, Users, X, XCircle, ExternalLink, Wind, Waves } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useRoute } from "wouter";
import { toast } from "sonner";

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

const buildOsmMapLink = (lat: number, lng: number, zoom = 15) =>
  `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=${zoom}/${lat}/${lng}`;

type EventWeatherSnapshot = {
  source?: string;
  fetchedAt?: string;
  targetTime?: string;
  resolvedTime?: string | null;
  timezone?: string | null;
  wind?: {
    speedMps?: number | null;
    directionDeg?: number | null;
  };
  waves?: {
    heightM?: number | null;
    directionDeg?: number | null;
    periodSeconds?: number | null;
  };
};

const parseWeatherSnapshot = (raw: unknown): EventWeatherSnapshot | null => {
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as EventWeatherSnapshot;
    } catch {
      return null;
    }
  }
  if (typeof raw === "object") return raw as EventWeatherSnapshot;
  return null;
};

const pointsEqual = (a: RoutePoint[], b: RoutePoint[]) => {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i].lat !== b[i].lat || a[i].lng !== b[i].lng) {
      return false;
    }
  }
  return true;
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
    onSuccess: (data: any) => {
      utils.community.clubs.events.attendees.invalidate({ eventId });
      utils.community.clubs.events.list.invalidate();
      if (Number(data?.actionXp?.awardedXp ?? 0) > 0) {
        toast.success(`+${data.actionXp.awardedXp} XP Action`);
      }
    },
  });

  const deleteEvent = trpc.community.clubs.events.delete.useMutation({
    onSuccess: () => {
      utils.community.clubs.events.list.invalidate();
      window.location.href = `/community/club/${clubId}`;
    },
  });
  const refreshWeather = trpc.community.clubs.events.refreshWeather.useMutation({
    onSuccess: () => {
      toast.success("Meteo aggiornato");
      utils.community.clubs.events.get.invalidate({ eventId });
      utils.community.clubs.events.list.invalidate();
    },
    onError: (error) => toast.error(error.message || "Aggiornamento meteo non riuscito"),
  });
  const updateEventMutation = trpc.community.clubs.events.update.useMutation({
    onSuccess: async () => {
      toast.success("Percorso evento aggiornato");
      await Promise.all([
        utils.community.clubs.events.get.invalidate({ eventId }),
        utils.community.clubs.events.list.invalidate(),
      ]);
      setIsEditingRoute(false);
    },
    onError: (error) => toast.error(error.message || "Aggiornamento percorso non riuscito"),
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
  const eventLat = Number(event?.locationLat);
  const eventLng = Number(event?.locationLng);
  const hasEventMap = Number.isFinite(eventLat) && Number.isFinite(eventLng);
  const routeGeojson = useMemo(
    () => parseRouteGeojson(event?.routeGeojson),
    [event?.routeGeojson]
  );
  const routePoints = useMemo(() => routeGeojsonToPoints(routeGeojson), [routeGeojson]);
  const weatherSnapshot = useMemo(
    () => parseWeatherSnapshot(event?.weatherSnapshot),
    [event?.weatherSnapshot]
  );
  const weatherTime = weatherSnapshot?.resolvedTime || weatherSnapshot?.targetTime || weatherSnapshot?.fetchedAt || null;
  const [isEditingRoute, setIsEditingRoute] = useState(false);
  const [draftPin, setDraftPin] = useState<RoutePoint | null>(null);
  const [draftRoutePoints, setDraftRoutePoints] = useState<RoutePoint[]>([]);

  useEffect(() => {
    if (isEditingRoute) return;
    const nextPin = hasEventMap ? { lat: eventLat, lng: eventLng } : null;
    setDraftPin((prev) => {
      if (!prev && !nextPin) return prev;
      if (prev && nextPin && prev.lat === nextPin.lat && prev.lng === nextPin.lng) return prev;
      return nextPin;
    });
    setDraftRoutePoints((prev) => (pointsEqual(prev, routePoints) ? prev : routePoints));
  }, [isEditingRoute, hasEventMap, eventLat, eventLng, event?.id, routePoints]);

  if (!match || !Number.isFinite(clubId) || !Number.isFinite(eventId)) {
    return null;
  }

  return (
    <AppLayout className="text-foreground">
      <div className="container py-6 lg:py-3 space-y-6 lg:space-y-3">
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
            {hasEventMap || (isStaff && isEditingRoute) ? (
              <div className="space-y-2 pt-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">Mappa e percorso</p>
                  {isStaff ? (
                    isEditingRoute ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline-neon"
                          className="h-8"
                          onClick={() => {
                            setDraftPin(hasEventMap ? { lat: eventLat, lng: eventLng } : null);
                            setDraftRoutePoints(routePoints);
                            setIsEditingRoute(false);
                          }}
                        >
                          <X className="mr-1 h-3.5 w-3.5" />
                          Annulla
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="neon"
                          className="h-8"
                          onClick={() =>
                            updateEventMutation.mutate({
                              eventId,
                              locationLat: draftPin?.lat,
                              locationLng: draftPin?.lng,
                              routeGeojson: pointsToRouteGeojson(draftRoutePoints),
                            })
                          }
                          disabled={updateEventMutation.isPending}
                        >
                          <Save className="mr-1 h-3.5 w-3.5" />
                          {updateEventMutation.isPending ? "Salvataggio..." : "Salva percorso"}
                        </Button>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline-neon"
                        className="h-8"
                        onClick={() => setIsEditingRoute(true)}
                      >
                        <Pencil className="mr-1 h-3.5 w-3.5" />
                        Modifica percorso
                      </Button>
                    )
                  ) : null}
                </div>
                <EventMapEditor
                  pin={isEditingRoute ? draftPin : { lat: eventLat, lng: eventLng }}
                  routePoints={isEditingRoute ? draftRoutePoints : routePoints}
                  onPinChange={isEditingRoute ? setDraftPin : () => {}}
                  onRouteChange={isEditingRoute ? setDraftRoutePoints : () => {}}
                  readOnly={!isEditingRoute}
                  className="h-72 w-full rounded-xl border border-border/70"
                />
                {isEditingRoute ? (
                  <p className="text-xs text-muted-foreground">
                    Percorso corrente: {(routeDistanceMeters(draftRoutePoints) / 1000).toFixed(2)} km
                  </p>
                ) : null}
                {hasEventMap ? (
                  <a
                    href={buildOsmMapLink(eventLat, eventLng)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Apri mappa completa
                  </a>
                ) : null}
              </div>
            ) : null}
            {!hasEventMap && isStaff && !isEditingRoute ? (
              <div className="rounded-lg border border-border/70 bg-card/40 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-muted-foreground">Nessuna mappa/pin impostata per questo evento.</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline-neon"
                    className="h-8"
                    onClick={() => setIsEditingRoute(true)}
                  >
                    <Pencil className="mr-1 h-3.5 w-3.5" />
                    Aggiungi mappa
                  </Button>
                </div>
              </div>
            ) : null}
            {weatherSnapshot ? (
              <div className="space-y-2 rounded-lg border border-border/70 bg-card/40 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">Meteo mare</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline-neon"
                    className="h-8"
                    onClick={() => refreshWeather.mutate({ eventId })}
                    disabled={refreshWeather.isPending}
                  >
                    <RefreshCw className={`mr-1 h-3.5 w-3.5 ${refreshWeather.isPending ? "animate-spin" : ""}`} />
                    Aggiorna
                  </Button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-md border border-border/60 bg-background/40 p-2 text-sm">
                    <p className="flex items-center gap-1 text-muted-foreground">
                      <Wind className="h-3.5 w-3.5" />
                      Vento
                    </p>
                    <p className="font-semibold">
                      {weatherSnapshot.wind?.speedMps != null ? `${weatherSnapshot.wind.speedMps.toFixed(1)} m/s` : "n/d"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Direzione: {weatherSnapshot.wind?.directionDeg != null ? `${Math.round(weatherSnapshot.wind.directionDeg)}°` : "n/d"}
                    </p>
                  </div>
                  <div className="rounded-md border border-border/60 bg-background/40 p-2 text-sm">
                    <p className="flex items-center gap-1 text-muted-foreground">
                      <Waves className="h-3.5 w-3.5" />
                      Onde
                    </p>
                    <p className="font-semibold">
                      {weatherSnapshot.waves?.heightM != null ? `${weatherSnapshot.waves.heightM.toFixed(2)} m` : "n/d"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Direzione: {weatherSnapshot.waves?.directionDeg != null ? `${Math.round(weatherSnapshot.waves.directionDeg)}°` : "n/d"}
                      {" · "}
                      Periodo: {weatherSnapshot.waves?.periodSeconds != null ? `${weatherSnapshot.waves.periodSeconds.toFixed(1)} s` : "n/d"}
                    </p>
                  </div>
                </div>
                {weatherTime ? (
                  <p className="text-xs text-muted-foreground">
                    Riferimento meteo: {formatDateTime(weatherTime)}
                  </p>
                ) : null}
              </div>
            ) : hasEventMap ? (
              <div className="rounded-lg border border-border/70 bg-card/40 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-muted-foreground">Meteo non ancora disponibile.</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline-neon"
                    className="h-8"
                    onClick={() => refreshWeather.mutate({ eventId })}
                    disabled={refreshWeather.isPending}
                  >
                    <RefreshCw className={`mr-1 h-3.5 w-3.5 ${refreshWeather.isPending ? "animate-spin" : ""}`} />
                    Carica meteo
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-2 pt-2 sm:grid-cols-3 lg:grid-cols-4">
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
