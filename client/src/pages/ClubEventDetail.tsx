/**
 * Club event: what, when and where, the swimmer's answer, map and route, sea weather and the
 * people who answered (the shell header carries the «Evento» title and the back button).
 */

import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { toast } from "sonner";
import {
  Calendar,
  CheckCircle2,
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  ExternalLink,
  HelpCircle,
  MapPin,
  Pencil,
  RefreshCw,
  Save,
  Sun,
  Trash2,
  Wind,
  Waves,
  X,
  XCircle,
} from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { LoadError, LoadingSkeleton } from "@/components/corsia/LoadState";
import { Metric } from "@/components/corsia/Metric";
import EventMapEditor from "@/components/club/EventMapEditor";
import {
  parseRouteGeojson,
  pointsToRouteGeojson,
  routeDistanceMeters,
  routeGeojsonToPoints,
  type RoutePoint,
} from "@/lib/club-event-map";
import { NO_VALUE, formatDistance, formatInteger, formatSessionDate, getInitials, toFiniteNumber } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

type EventRsvpStatus = "going" | "maybe" | "not_going";

const RSVP_OPTIONS: ReadonlyArray<{
  value: EventRsvpStatus;
  label: string;
  group: string;
  Icon: typeof CheckCircle2;
}> = [
  { value: "going", label: "Partecipo", group: "Partecipano", Icon: CheckCircle2 },
  { value: "maybe", label: "Forse", group: "Forse", Icon: HelpCircle },
  { value: "not_going", label: "Non partecipo", group: "Non partecipano", Icon: XCircle },
];

const sectionTitle = "text-[17px] font-bold";

const decimalFormats = new Map<number, Intl.NumberFormat>();
/** Italian decimal comma with a fixed number of digits: 18.46 → «18,5»; «—» if not a number. */
function formatDecimal(value: unknown, digits: number) {
  const number = toFiniteNumber(value);
  if (number === null) return NO_VALUE;
  let format = decimalFormats.get(digits);
  if (!format) {
    format = new Intl.NumberFormat("it-IT", { minimumFractionDigits: digits, maximumFractionDigits: digits });
    decimalFormats.set(digits, format);
  }
  return format.format(number);
}

/** «sab 1 nov · 10:00 – 12:00» within a day, both dates when it spans more; null without a start. */
function formatEventWhen(start: unknown, end: unknown) {
  const from = formatSessionDate(start as string | Date | null | undefined);
  if (from === NO_VALUE) return null;
  const to = formatSessionDate(end as string | Date | null | undefined);
  if (to === NO_VALUE) return from;
  const sameDay = new Date(start as string).toDateString() === new Date(end as string).toDateString();
  return sameDay ? `${from} – ${to.split(" · ")[1]}` : `${from} – ${to}`;
}

const buildOsmMapLink = (lat: number, lng: number, zoom = 15) =>
  `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=${zoom}/${lat}/${lng}`;

type EventWeatherSnapshot = {
  source?: string;
  fetchedAt?: string;
  targetTime?: string;
  resolvedTime?: string | null;
  timezone?: string | null;
  general?: {
    temperatureC?: number | null;
    weatherCode?: number | null;
  };
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

function degreesToCardinal(degrees: number | null | undefined) {
  if (!Number.isFinite(degrees)) return NO_VALUE;
  const labels = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO"];
  const index = Math.round((((degrees as number) % 360) / 22.5)) % 16;
  return labels[index];
}

/** «NE (45°)», or the cardinal point alone when there is no angle. */
function formatDirection(degrees: number | null | undefined) {
  const cardinal = degreesToCardinal(degrees);
  return Number.isFinite(degrees) ? `${cardinal} (${Math.round(degrees as number)}°)` : cardinal;
}

function describeWeatherCode(code: number | null | undefined): {
  label: string;
  Icon: typeof Sun;
} {
  if (!Number.isFinite(code)) return { label: "Condizioni non disponibili", Icon: Cloud };
  const value = Math.round(code as number);
  if (value === 0) return { label: "Sereno", Icon: Sun };
  if (value === 1) return { label: "Prevalentemente sereno", Icon: CloudSun };
  if (value === 2) return { label: "Parzialmente nuvoloso", Icon: CloudSun };
  if (value === 3) return { label: "Coperto", Icon: Cloud };
  if (value === 45 || value === 48) return { label: "Nebbia", Icon: CloudFog };
  if ((value >= 51 && value <= 57) || (value >= 61 && value <= 67) || (value >= 80 && value <= 82)) {
    return { label: "Pioggia", Icon: CloudRain };
  }
  if ((value >= 71 && value <= 77) || value === 85 || value === 86) return { label: "Neve", Icon: CloudSnow };
  if (value >= 95) return { label: "Temporale", Icon: CloudLightning };
  return { label: "Variabile", Icon: Cloud };
}

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

function Notice({ children, clubId }: { children: ReactNode; clubId?: number }) {
  return (
    <AppLayout>
      <div className="surface-panel p-4 text-center">
        <p className="text-sm text-muted-foreground">{children}</p>
        {clubId ? (
          <Button variant="outline" className="mt-3" asChild>
            <Link href={`/community/club/${clubId}`}>Torna al club</Link>
          </Button>
        ) : null}
      </div>
    </AppLayout>
  );
}

function WeatherTile({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-xl bg-raised p-3 text-sm">
      <p className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className="mt-1 font-semibold">{value}</p>
      {detail ? <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p> : null}
    </div>
  );
}

export default function ClubEventDetail() {
  const [match, params] = useRoute("/community/club/:clubId/event/:eventId");
  const [, navigate] = useLocation();
  const clubId = Number(params?.clubId);
  const eventId = Number(params?.eventId);
  const validIds = match && Number.isFinite(clubId) && Number.isFinite(eventId);
  const titleId = useId();
  const rsvpTitleId = useId();
  const rsvpGroupId = useId();
  const mapTitleId = useId();
  const weatherTitleId = useId();
  const peopleTitleId = useId();

  const utils = trpc.useUtils();

  const clubQuery = trpc.community.clubs.get.useQuery({ clubId }, { enabled: validIds });
  const eventQuery = trpc.community.clubs.events.get.useQuery({ eventId }, { enabled: validIds });
  const attendeesQuery = trpc.community.clubs.events.attendees.useQuery({ eventId }, { enabled: validIds });

  const rsvpMutation = trpc.community.clubs.events.rsvp.useMutation({
    onSuccess: (data: any) => {
      utils.community.clubs.events.attendees.invalidate({ eventId });
      utils.community.clubs.events.list.invalidate();
      const awardedXp = toFiniteNumber(data?.actionXp?.awardedXp) ?? 0;
      if (awardedXp > 0) {
        toast.success(`+${formatInteger(awardedXp)} XP`);
      }
    },
    onError: (error) => toast.error(error.message || "Risposta non salvata"),
  });

  const [deleteOpen, setDeleteOpen] = useState(false);
  const deleteEvent = trpc.community.clubs.events.delete.useMutation({
    onSuccess: () => {
      toast.success("Evento eliminato");
      utils.community.clubs.events.list.invalidate();
      // The event is gone: replace its page, so «back» does not land on «not found».
      navigate(`/community/club/${clubId}`, { replace: true });
    },
    onError: (error) => toast.error(error.message || "Eliminazione non riuscita"),
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
  const byStatus = (status: EventRsvpStatus) => attendees.filter((a) => a.status === status);

  const currentUserId = trpc.profile.get.useQuery().data?.userId;
  const myStatus = attendees.find((a) => a.user?.id === currentUserId)?.status as
    | EventRsvpStatus
    | undefined;

  const club = clubQuery.data as any | undefined;
  const isStaff =
    club?.member_role && ["owner", "admin", "moderator"].includes(club.member_role);

  const rawEvent = (eventQuery.data as any)?.event ?? eventQuery.data;
  const event = useMemo(() => {
    if (!rawEvent || typeof rawEvent !== "object") return rawEvent;
    const normalized = rawEvent as Record<string, unknown>;
    return {
      ...normalized,
      locationLat: normalized.locationLat ?? normalized.location_lat ?? null,
      locationLng: normalized.locationLng ?? normalized.location_lng ?? null,
      routeGeojson: normalized.routeGeojson ?? normalized.route_geojson ?? null,
      weatherSnapshot: normalized.weatherSnapshot ?? normalized.weather_snapshot ?? null,
    };
  }, [rawEvent]);
  const title = (event as any)?.title ?? "Evento";
  const eventLat = Number((event as any)?.locationLat);
  const eventLng = Number((event as any)?.locationLng);
  const hasPin = Number.isFinite(eventLat) && Number.isFinite(eventLng);
  const routeGeojson = useMemo(
    () => parseRouteGeojson((event as any)?.routeGeojson),
    [(event as any)?.routeGeojson]
  );
  const routePoints = useMemo(() => routeGeojsonToPoints(routeGeojson), [routeGeojson]);
  const hasMapData = hasPin || routePoints.length > 0;
  const weatherSnapshot = useMemo(
    () => parseWeatherSnapshot((event as any)?.weatherSnapshot),
    [(event as any)?.weatherSnapshot]
  );
  const weatherCondition = describeWeatherCode(weatherSnapshot?.general?.weatherCode);
  const weatherTime = weatherSnapshot?.resolvedTime || weatherSnapshot?.targetTime || weatherSnapshot?.fetchedAt || null;
  const [isEditingRoute, setIsEditingRoute] = useState(false);
  const [draftPin, setDraftPin] = useState<RoutePoint | null>(null);
  const [draftRoutePoints, setDraftRoutePoints] = useState<RoutePoint[]>([]);

  useEffect(() => {
    if (isEditingRoute) return;
    const nextPin = hasPin ? { lat: eventLat, lng: eventLng } : null;
    setDraftPin((prev) => {
      if (!prev && !nextPin) return prev;
      if (prev && nextPin && prev.lat === nextPin.lat && prev.lng === nextPin.lng) return prev;
      return nextPin;
    });
    setDraftRoutePoints((prev) => (pointsEqual(prev, routePoints) ? prev : routePoints));
  }, [isEditingRoute, hasPin, eventLat, eventLng, (event as any)?.id, routePoints]);

  // Before `isPending`: a disabled query stays pending for ever.
  if (!validIds) return <Notice>Evento non trovato.</Notice>;
  if (eventQuery.isPending) {
    return (
      <AppLayout>
        <LoadingSkeleton label="Caricamento dell'evento…" count={3} itemClassName="h-32 w-full rounded-2xl" />
      </AppLayout>
    );
  }
  if (!event) {
    // A missing event or one of a secret club is «not found»; anything else can be retried.
    const errorCode = eventQuery.error?.data?.code;
    if (eventQuery.isError && errorCode !== "NOT_FOUND" && errorCode !== "FORBIDDEN") {
      return (
        <AppLayout>
          <LoadError onRetry={() => void eventQuery.refetch()} />
        </AppLayout>
      );
    }
    return <Notice clubId={clubId}>Evento non trovato.</Notice>;
  }

  const when = formatEventWhen((event as any).startTime, (event as any).endTime);
  const shownRoutePoints = isEditingRoute ? draftRoutePoints : routePoints;
  const attendeesLoaded = Boolean(attendeesQuery.data);

  return (
    <AppLayout>
      <div className="space-y-4">
        <section aria-labelledby={titleId} className="surface-panel p-4">
          <h2 id={titleId} className="break-words font-display text-[32px] font-bold leading-none">
            {title}
          </h2>
          {when || (event as any).location ? (
            <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
              {when ? (
                <li className="flex items-center gap-2">
                  <Calendar className="size-4 shrink-0" aria-hidden />
                  <span>{when}</span>
                </li>
              ) : null}
              {(event as any).location ? (
                <li className="flex items-center gap-2">
                  <MapPin className="size-4 shrink-0" aria-hidden />
                  <span className="min-w-0 break-words">{(event as any).location}</span>
                </li>
              ) : null}
            </ul>
          ) : null}
          {(event as any).description ? (
            <p className="mt-3 whitespace-pre-wrap text-sm text-foreground">{(event as any).description}</p>
          ) : null}
          {isStaff ? (
            <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="mt-4">
                  <Trash2 aria-hidden />
                  Elimina evento
                </Button>
              </DialogTrigger>
              <DialogContent role="alertdialog" showCloseButton={false} className="sm:max-w-sm">
                <DialogHeader>
                  <DialogTitle>Eliminare «{title}»?</DialogTitle>
                  <DialogDescription>L'evento sparisce per tutti i membri del club.</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="outline">Annulla</Button>
                  </DialogClose>
                  <Button
                    variant="destructive"
                    disabled={deleteEvent.isPending}
                    onClick={() => deleteEvent.mutate({ eventId })}
                  >
                    {deleteEvent.isPending ? "Eliminazione..." : "Elimina"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          ) : null}
        </section>

        <section aria-labelledby={rsvpTitleId} className="surface-panel p-4">
          <h3 id={rsvpTitleId} className={sectionTitle}>
            Partecipazione
          </h3>
          {/* Only once loaded: never «0» while loading or after an error (the list below says so). */}
          {attendeesLoaded ? (
            <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {RSVP_OPTIONS.map((option) => (
                <Metric
                  key={option.value}
                  size="sm"
                  value={formatInteger(byStatus(option.value).length)}
                  label={option.group}
                />
              ))}
              <Metric size="sm" value={formatInteger(attendees.length)} label="Risposte" />
            </div>
          ) : null}
          <div className={cn(attendeesLoaded && "mt-4 border-t border-border pt-4", !attendeesLoaded && "mt-3")}>
            <p id={rsvpGroupId} className="text-sm font-semibold">
              La tua risposta
            </p>
            <div role="group" aria-labelledby={rsvpGroupId} className="mt-2 flex flex-wrap gap-2">
              {RSVP_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  size="sm"
                  variant={myStatus === option.value ? "default" : "outline"}
                  aria-pressed={myStatus === option.value}
                  onClick={() => rsvpMutation.mutate({ eventId, status: option.value })}
                  disabled={rsvpMutation.isPending}
                >
                  <option.Icon aria-hidden />
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
        </section>

        {hasMapData || isStaff ? (
          <section aria-labelledby={mapTitleId} className="surface-panel p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id={mapTitleId} className={sectionTitle}>
                Mappa e percorso
              </h3>
              {isStaff && isEditingRoute ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setDraftPin(hasPin ? { lat: eventLat, lng: eventLng } : null);
                      setDraftRoutePoints(routePoints);
                      setIsEditingRoute(false);
                    }}
                  >
                    <X aria-hidden />
                    Annulla
                  </Button>
                  <Button
                    type="button"
                    size="sm"
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
                    <Save aria-hidden />
                    {updateEventMutation.isPending ? "Salvataggio..." : "Salva percorso"}
                  </Button>
                </div>
              ) : isStaff && hasMapData ? (
                <Button type="button" size="sm" variant="outline" onClick={() => setIsEditingRoute(true)}>
                  <Pencil aria-hidden />
                  Modifica percorso
                </Button>
              ) : null}
            </div>
            {hasMapData || isEditingRoute ? (
              <div className="mt-3 space-y-2">
                <EventMapEditor
                  pin={isEditingRoute ? draftPin : hasPin ? { lat: eventLat, lng: eventLng } : null}
                  routePoints={shownRoutePoints}
                  onPinChange={isEditingRoute ? setDraftPin : () => {}}
                  onRouteChange={isEditingRoute ? setDraftRoutePoints : () => {}}
                  readOnly={!isEditingRoute}
                  className="h-72 w-full rounded-xl border border-border"
                />
                {shownRoutePoints.length > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Waypoint: {shownRoutePoints.length}
                    {shownRoutePoints.length >= 2
                      ? ` · Percorso: ${formatDistance(routeDistanceMeters(shownRoutePoints))}`
                      : ""}
                  </p>
                ) : null}
                {hasPin ? (
                  <a
                    href={buildOsmMapLink(eventLat, eventLng)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-sm font-semibold text-action-text hover:underline"
                  >
                    <ExternalLink className="size-4" aria-hidden />
                    Apri mappa completa
                  </a>
                ) : null}
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">Nessuna mappa per questo evento.</p>
                <Button type="button" size="sm" variant="outline" onClick={() => setIsEditingRoute(true)}>
                  <Pencil aria-hidden />
                  Aggiungi mappa
                </Button>
              </div>
            )}
          </section>
        ) : null}

        {weatherSnapshot || hasPin ? (
          <section aria-labelledby={weatherTitleId} className="surface-panel p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 id={weatherTitleId} className={sectionTitle}>
                Meteo mare
              </h3>
              <Button
                type="button"
                size="sm"
                variant="outline"
                aria-label={weatherSnapshot ? "Aggiorna il meteo" : undefined}
                onClick={() => refreshWeather.mutate({ eventId })}
                disabled={refreshWeather.isPending}
              >
                <RefreshCw className={cn(refreshWeather.isPending && "animate-spin")} aria-hidden />
                {weatherSnapshot ? "Aggiorna" : "Carica meteo"}
              </Button>
            </div>
            {weatherSnapshot ? (
              <>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <WeatherTile
                    icon={<weatherCondition.Icon className="size-4" aria-hidden />}
                    label="Meteo generale"
                    value={
                      toFiniteNumber(weatherSnapshot.general?.temperatureC) !== null
                        ? `${weatherCondition.label} · ${formatDecimal(weatherSnapshot.general?.temperatureC, 1)} °C`
                        : weatherCondition.label
                    }
                  />
                  <WeatherTile
                    icon={<Wind className="size-4" aria-hidden />}
                    label="Vento"
                    value={
                      toFiniteNumber(weatherSnapshot.wind?.speedMps) !== null
                        ? `${formatDecimal(weatherSnapshot.wind?.speedMps, 1)} m/s`
                        : NO_VALUE
                    }
                    detail={`Direzione: ${formatDirection(weatherSnapshot.wind?.directionDeg)}`}
                  />
                  <WeatherTile
                    icon={<Waves className="size-4" aria-hidden />}
                    label="Onde"
                    value={
                      toFiniteNumber(weatherSnapshot.waves?.heightM) !== null
                        ? `${formatDecimal(weatherSnapshot.waves?.heightM, 2)} m`
                        : NO_VALUE
                    }
                    detail={`Direzione: ${formatDirection(weatherSnapshot.waves?.directionDeg)} · Periodo: ${
                      toFiniteNumber(weatherSnapshot.waves?.periodSeconds) !== null
                        ? `${formatDecimal(weatherSnapshot.waves?.periodSeconds, 1)} s`
                        : NO_VALUE
                    }`}
                  />
                </div>
                {weatherTime && formatSessionDate(weatherTime) !== NO_VALUE ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Riferimento meteo: {formatSessionDate(weatherTime)}
                  </p>
                ) : null}
              </>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">Meteo non ancora disponibile.</p>
            )}
          </section>
        ) : null}

        <section aria-labelledby={peopleTitleId} className="surface-panel p-4">
          <h3 id={peopleTitleId} className={sectionTitle}>
            Partecipanti
          </h3>
          {attendeesQuery.isPending ? (
            <LoadingSkeleton
              label="Caricamento dei partecipanti…"
              count={3}
              className="mt-3 space-y-2"
              itemClassName="h-12 w-full rounded-xl"
            />
          ) : !attendeesLoaded && attendeesQuery.isError ? (
            <LoadError className="mt-3 border-0 bg-raised" onRetry={() => void attendeesQuery.refetch()} />
          ) : (
            RSVP_OPTIONS.map((option) => {
              const people = byStatus(option.value);
              return (
                <div
                  key={option.value}
                  className="mt-4 border-t border-border pt-4 first-of-type:mt-3 first-of-type:border-t-0 first-of-type:pt-0"
                >
                  <h4 className="text-sm font-semibold">
                    {option.group}{" "}
                    <span className="font-normal text-muted-foreground tabular-nums">
                      ({formatInteger(people.length)})
                    </span>
                  </h4>
                  {people.length === 0 ? (
                    <p className="mt-1 text-sm text-muted-foreground">Nessuno ancora.</p>
                  ) : (
                    <ul className="mt-2 grid gap-x-4 gap-y-3 sm:grid-cols-2">
                      {people.map((attendee) => {
                        const fullName = attendee.user?.fullName || null;
                        const username = attendee.user?.username || null;
                        const name = fullName || username || "Nuotatore";
                        return (
                          <li key={attendee.id} className="flex min-w-0 items-center gap-3">
                            <Avatar className="size-9">
                              <AvatarImage src={attendee.user?.profilePicture || undefined} alt="" />
                              <AvatarFallback className="bg-raised text-xs font-semibold">
                                {getInitials(name)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold">{name}</p>
                              {/* The @username only under a real name, never twice. */}
                              {fullName && username ? (
                                <p className="truncate text-xs text-muted-foreground">@{username}</p>
                              ) : null}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })
          )}
        </section>
      </div>
    </AppLayout>
  );
}
