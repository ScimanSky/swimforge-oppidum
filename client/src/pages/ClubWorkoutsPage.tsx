import { useMemo } from "react";
import { Link, useRoute } from "wouter";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { clampLimit } from "@/lib/pagination";
import { getWorkoutSeriesDisplay, parseWorkoutPlan } from "@/lib/workout-plan";
import { ArrowLeft, CalendarDays, Dumbbell } from "lucide-react";

function formatSessionDate(value?: string | Date | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    const fallback = String(value).slice(0, 10);
    const parsed = new Date(`${fallback}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return fallback || "-";
    return parsed.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
  }
  return date.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function toSessionKey(value?: string | Date | null) {
  if (!value) return "";
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw.slice(0, 10);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default function ClubWorkoutsPage() {
  const [detailMatch, detailParams] = useRoute("/community/club/:clubId/workouts/:workoutId");
  const [listMatch, listParams] = useRoute("/community/club/:clubId/workouts");
  const match = detailMatch || listMatch;
  const clubId = Number(detailParams?.clubId ?? listParams?.clubId);
  const routeWorkoutId = Number(detailParams?.workoutId ?? 0);
  const selectedWorkoutId = Number.isFinite(routeWorkoutId) && routeWorkoutId > 0 ? routeWorkoutId : null;

  const publishedWorkoutsLimit = clampLimit(120);
  const clubQuery = trpc.community.clubs.get.useQuery(
    { clubId },
    { enabled: match && Number.isFinite(clubId) }
  );
  const workoutsQuery = trpc.community.clubs.workouts.listPublished.useQuery(
    { clubId, limit: publishedWorkoutsLimit, offset: 0 },
    {
      enabled: match && Number.isFinite(clubId),
      retry: 1,
      refetchOnWindowFocus: false,
    }
  );
  const workoutDetailQuery = trpc.community.clubs.workouts.getPublished.useQuery(
    { clubId, workoutId: selectedWorkoutId ?? 0 },
    { enabled: match && Number.isFinite(clubId) && Boolean(selectedWorkoutId) }
  );

  const workouts = ((workoutsQuery.data as any)?.workouts as any[]) ?? [];
  const todayKey = toSessionKey(new Date());

  const selectedWorkout = useMemo(() => {
    if (selectedWorkoutId) {
      const found = workouts.find((item) => Number(item.id) === selectedWorkoutId);
      if (found) return found;
      return (workoutDetailQuery.data as any)?.workout ?? null;
    }
    return null;
  }, [selectedWorkoutId, workoutDetailQuery.data, workouts]);

  const todayWorkout = useMemo(() => {
    const fromSelected = selectedWorkout && toSessionKey(selectedWorkout.sessionDate) === todayKey ? selectedWorkout : null;
    if (fromSelected) return fromSelected;
    return workouts.find((item) => toSessionKey(item.sessionDate) === todayKey) ?? null;
  }, [selectedWorkout, todayKey, workouts]);

  const groupedByDate = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const workout of workouts) {
      const key = toSessionKey(workout.sessionDate) || "sconosciuta";
      const current = map.get(key) ?? [];
      current.push(workout);
      map.set(key, current);
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [workouts]);

  if (!match || !Number.isFinite(clubId)) return null;

  if (clubQuery.isLoading || workoutsQuery.isLoading || workoutDetailQuery.isLoading) {
    return (
      <AppLayout>
        <div className="container py-6">
          <div className="surface-panel p-6 text-center text-muted-foreground">Caricamento workouts club...</div>
        </div>
      </AppLayout>
    );
  }

  const club = clubQuery.data as any;
  if (!club || !club.is_member) {
    return (
      <AppLayout>
        <div className="container py-6">
          <div className="surface-panel p-6 text-center text-muted-foreground">Devi essere iscritto al club per vedere i workout pubblicati.</div>
        </div>
      </AppLayout>
    );
  }

  const detailWorkout = selectedWorkout ?? todayWorkout;
  const detailPlan = parseWorkoutPlan(detailWorkout?.workoutJson);

  return (
    <AppLayout>
      <div className="container py-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <Link href={`/community/club/${clubId}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" /> Torna al club
            </Link>
            <h1 className="mt-1 text-2xl font-display font-bold">Workout Club • {club.name}</h1>
            <p className="text-sm text-muted-foreground">Solo workout pubblicati dal coach.</p>
          </div>
          <Badge variant="outline">Membri</Badge>
        </div>

        {todayWorkout ? (
          <section className="surface-panel border-amber-400/50 bg-amber-500/10 p-4 space-y-2">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-amber-300" />
              <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-300">Workout del Giorno</h2>
            </div>
            <p className="text-lg font-semibold">{String(parseWorkoutPlan(todayWorkout.workoutJson)?.title ?? todayWorkout.title ?? "Workout")}</p>
            <p className="text-sm text-muted-foreground">
              Data: {formatSessionDate(todayWorkout.sessionDate)} • Distanza: {String(parseWorkoutPlan(todayWorkout.workoutJson)?.totalDistance ?? "n/d")}
            </p>
            <Link href={`/community/club/${clubId}/workouts/${todayWorkout.id}`}>
              <Button size="sm" variant="neon">
                <Dumbbell className="mr-1.5 h-4 w-4" />
                Apri workout del giorno
              </Button>
            </Link>
          </section>
        ) : null}

        {detailWorkout ? (
          <section className="surface-panel p-4 space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Dettaglio Workout</h2>
            <p className="text-lg font-semibold">{String(detailPlan?.title ?? detailWorkout.title ?? "Workout")}</p>
            <p className="text-sm text-muted-foreground">
              Data: {formatSessionDate(detailWorkout.sessionDate)} • Distanza: {String(detailPlan?.totalDistance ?? "n/d")} • Durata: {String(detailPlan?.estimatedDuration ?? "n/d")}
            </p>
            {Array.isArray(detailPlan?.blocks) && detailPlan.blocks.length > 0 ? (
              <div className="space-y-2">
                {detailPlan.blocks.map((block: any, index: number) => (
                  <div key={`${detailWorkout.id}-${index}`} className="rounded-xl border border-border/60 bg-card/35 p-3">
                    <p className="text-sm font-semibold">{String(block?.label ?? `Blocco ${index + 1}`)}</p>
                    {Array.isArray(block?.items) && block.items.length > 0 ? (
                      <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                        {block.items.map((item: any, itemIndex: number) => (
                          <li key={`${detailWorkout.id}-${index}-${itemIndex}`}>
                            {(() => {
                              const line = getWorkoutSeriesDisplay(item);
                              return (
                                <div className="space-y-0.5">
                                  <p className="font-medium text-foreground/90">{String(item?.label ?? "Serie")}</p>
                                  <p>Serie: {line.reps} • Distanza serie: {line.seriesDistance} • Ripartenza: {line.sendoff}</p>
                                  {line.betweenSetsRest ? <p>Recupero prima prossima serie: {line.betweenSetsRest}</p> : null}
                                </div>
                              );
                            })()}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Dettagli workout non disponibili.</p>
            )}
          </section>
        ) : null}

        <section className="surface-panel p-4 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Archivio per Giorni</h2>
          {groupedByDate.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nessun workout pubblicato.</p>
          ) : (
            <div className="space-y-3">
              {groupedByDate.map(([dateKey, items]) => (
                <div key={dateKey} className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{formatSessionDate(dateKey)}</p>
                  <div className="grid gap-2">
                    {items.map((workout) => {
                      const plan = parseWorkoutPlan(workout.workoutJson);
                      return (
                        <Link
                          key={workout.id}
                          href={`/community/club/${clubId}/workouts/${workout.id}`}
                          className="rounded-xl border border-border/60 bg-card/35 p-3 transition-colors hover:bg-card/55"
                        >
                          <p className="text-sm font-semibold">{String(plan?.title ?? workout.title ?? "Workout")}</p>
                          <p className="text-xs text-muted-foreground">
                            Distanza: {String(plan?.totalDistance ?? "n/d")} • Durata: {String(plan?.estimatedDuration ?? "n/d")}
                          </p>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppLayout>
  );
}
