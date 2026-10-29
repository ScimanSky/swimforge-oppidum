/**
 * Workouts the club coach published: today's first, then the archive by day (members only; the
 * shell header carries the «Club» title and the back button).
 */

import { useId, useMemo } from "react";
import { Link, useRoute } from "wouter";
import { CalendarDays, ChevronRight, Dumbbell } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { LoadError, LoadingSkeleton } from "@/components/corsia/LoadState";
import { ClubAccessState } from "@/components/club/ClubPageState";
import { clubAccess } from "@/lib/club-access";
import { formatSessionDay, planFact, sessionDayKey } from "@/lib/club-workouts";
import { trpc } from "@/lib/trpc";
import { clampLimit } from "@/lib/pagination";
import { parseWorkoutPlan } from "@/lib/workout-plan";

const sectionTitle = "text-[17px] font-bold";

/** «Distanza 2500m · Durata 60 min», leaving out what the plan does not say («n/d»). */
function workoutFacts(plan: ReturnType<typeof parseWorkoutPlan>) {
  const distance = planFact(plan?.totalDistance);
  const duration = planFact(plan?.estimatedDuration);
  const facts = [
    distance ? `Distanza ${distance}` : null,
    duration ? `Durata ${duration}` : null,
  ].filter(Boolean);
  return facts.length > 0 ? facts.join(" · ") : null;
}

export default function ClubWorkoutsPage() {
  const [match, params] = useRoute("/community/club/:clubId/workouts");
  const clubId = Number(params?.clubId);
  const todayTitleId = useId();
  const archiveTitleId = useId();
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

  const workouts = useMemo(() => ((workoutsQuery.data as any)?.workouts as any[]) ?? [], [workoutsQuery.data]);
  const todayKey = sessionDayKey(new Date());
  const todayWorkout = useMemo(() => {
    return workouts.find((item) => sessionDayKey(item.sessionDate) === todayKey) ?? null;
  }, [todayKey, workouts]);

  const groupedByDate = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const workout of workouts) {
      const key = sessionDayKey(workout.sessionDate);
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

  const access = clubAccess(clubQuery);
  if (access !== "member") {
    return (
      <AppLayout>
        <ClubAccessState
          access={access}
          clubId={clubId}
          loadingLabel="Caricamento degli allenamenti…"
          notMemberText="Iscriviti al club per vedere gli allenamenti pubblicati."
          onRetry={() => void clubQuery.refetch()}
        />
      </AppLayout>
    );
  }

  const club = clubQuery.data as any;
  const workoutHref = (workout: any) => `/community/club/${clubId}/workouts/${workout.id}`;
  const workoutTitle = (workout: any, plan: ReturnType<typeof parseWorkoutPlan>) =>
    String(plan?.title || workout.title || "Allenamento");
  const todayPlan = todayWorkout ? parseWorkoutPlan(todayWorkout.workoutJson) : null;
  const todayFacts = workoutFacts(todayPlan);

  return (
    <AppLayout>
      <div className="space-y-4">
        <div>
          <h2 className="font-display text-[28px] font-bold leading-none">Allenamenti</h2>
          <p className="mt-1 text-sm text-muted-foreground">{club.name} · pubblicati dal coach</p>
        </div>

        {todayWorkout ? (
          <section aria-labelledby={todayTitleId} className="surface-panel p-4">
            <h3 id={todayTitleId} className={`inline-flex items-center gap-2 ${sectionTitle}`}>
              <CalendarDays className="size-4 text-action-text" aria-hidden />
              Allenamento di oggi
            </h3>
            <p className="mt-2 font-semibold">{workoutTitle(todayWorkout, todayPlan)}</p>
            {todayFacts ? <p className="text-sm text-muted-foreground">{todayFacts}</p> : null}
            <Button size="sm" className="mt-3" asChild>
              <Link
                href={workoutHref(todayWorkout)}
                onClick={() => handleOpenWorkoutTracking(Number(todayWorkout.id), "day_card")}
              >
                <Dumbbell aria-hidden />
                Apri l'allenamento di oggi
              </Link>
            </Button>
          </section>
        ) : null}

        <section aria-labelledby={archiveTitleId} className="surface-panel p-4">
          <h3 id={archiveTitleId} className={sectionTitle}>
            Archivio
          </h3>
          {workoutsQuery.isPending ? (
            <LoadingSkeleton
              label="Caricamento degli allenamenti…"
              count={3}
              className="mt-3 space-y-2"
              itemClassName="h-12 w-full rounded-xl"
            />
          ) : !workoutsQuery.data && workoutsQuery.isError ? (
            <LoadError className="mt-3 border-0 bg-raised" onRetry={() => void workoutsQuery.refetch()} />
          ) : groupedByDate.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">Nessun allenamento pubblicato.</p>
          ) : (
            groupedByDate.map(([dateKey, items]) => (
              <div key={dateKey || "senza-data"} className="mt-3 border-t border-border pt-3 first-of-type:border-t-0 first-of-type:pt-0">
                <h4 className="text-sm font-semibold text-muted-foreground">
                  {dateKey ? formatSessionDay(dateKey) : "Senza data"}
                </h4>
                <ul>
                  {items.map((workout) => {
                    const plan = parseWorkoutPlan(workout.workoutJson);
                    const facts = workoutFacts(plan);
                    return (
                      <li key={workout.id}>
                        <Link
                          href={workoutHref(workout)}
                          className="flex min-h-11 items-center gap-3 py-2 transition-colors hover:text-action-text"
                          onClick={() => handleOpenWorkoutTracking(Number(workout.id), "archive_card")}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold">{workoutTitle(workout, plan)}</span>
                            {facts ? <span className="block text-xs text-muted-foreground">{facts}</span> : null}
                          </span>
                          <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </section>
      </div>
    </AppLayout>
  );
}
