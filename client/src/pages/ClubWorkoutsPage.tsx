import { useMemo } from "react";
import { Link, useRoute } from "wouter";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { clampLimit } from "@/lib/pagination";
import { parseWorkoutPlan } from "@/lib/workout-plan";
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
  const [match, params] = useRoute("/community/club/:clubId/workouts");
  const clubId = Number(params?.clubId);
  const trackEventMutation = trpc.community.analytics.track.useMutation();

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

  const workouts = ((workoutsQuery.data as any)?.workouts as any[]) ?? [];
  const todayKey = toSessionKey(new Date());
  const todayWorkout = useMemo(() => {
    return workouts.find((item) => toSessionKey(item.sessionDate) === todayKey) ?? null;
  }, [todayKey, workouts]);

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

  const handleOpenWorkoutTracking = (workoutId: number, source: "day_card" | "archive_card") => {
    trackEventMutation.mutate({
      eventName: "club_workout_open",
      source: "club_workouts_page",
      entityType: "club_workout",
      entityId: workoutId,
      metadata: {
        clubId,
        entryPoint: source,
      },
    });
  };

  if (clubQuery.isLoading || workoutsQuery.isLoading) {
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
              <Button
                size="sm"
                variant="neon"
                onClick={() => handleOpenWorkoutTracking(Number(todayWorkout.id), "day_card")}
              >
                <Dumbbell className="mr-1.5 h-4 w-4" />
                Apri workout del giorno
              </Button>
            </Link>
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
                          onClick={() => handleOpenWorkoutTracking(Number(workout.id), "archive_card")}
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
