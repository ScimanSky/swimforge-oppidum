/**
 * One workout the club coach published: date, distance, blocks and series, coach notes; mark it
 * done or print it (members only; the shell header carries the «Club» title and the back button).
 */

import { useId, useMemo } from "react";
import { useRoute } from "wouter";
import { CalendarDays, CheckCircle2, Clock3, Printer, Ruler, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/AppLayout";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { LoadError, LoadingSkeleton } from "@/components/corsia/LoadState";
import { ClubAccessState, ClubNotice } from "@/components/club/ClubPageState";
import { clubAccess } from "@/lib/club-access";
import { formatSessionDay, planFact } from "@/lib/club-workouts";
import { NO_VALUE, formatTimeAgo, getInitials } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { errorToastMessage } from "@/lib/trpc-errors";
import { getWorkoutSeriesDisplay, parseWorkoutPlan } from "@/lib/workout-plan";

const NOT_MEMBER_TEXT = "Iscriviti al club per vedere gli allenamenti pubblicati.";

export default function ClubWorkoutDetailPage() {
  const [match, params] = useRoute("/community/club/:clubId/workouts/:workoutId");
  const clubId = Number(params?.clubId);
  const workoutId = Number(params?.workoutId);
  const hasValidWorkoutId = Number.isFinite(workoutId) && workoutId > 0;
  const titleId = useId();

  const clubQuery = trpc.community.clubs.get.useQuery(
    { clubId },
    { enabled: match && Number.isFinite(clubId) }
  );
  const workoutDetailQuery = trpc.community.clubs.workouts.getPublished.useQuery(
    { clubId, workoutId: hasValidWorkoutId ? workoutId : 0, source: "club_workout_detail_page" },
    { enabled: match && Number.isFinite(clubId) && hasValidWorkoutId, retry: 1, refetchOnWindowFocus: false }
  );
  const isMember = clubAccess(clubQuery) === "member";
  const completionQuery = trpc.community.clubs.workouts.completion.useQuery(
    { clubId, workoutId: hasValidWorkoutId ? workoutId : 0 },
    { enabled: match && isMember && hasValidWorkoutId && Number.isFinite(clubId), retry: 1 }
  );
  const utils = trpc.useUtils();
  const markCompletedMutation = trpc.community.clubs.workouts.markCompleted.useMutation({
    onSuccess: async (data, vars) => {
      // The answer is the new state: the button changes at once (and keeps the focus).
      utils.community.clubs.workouts.completion.setData(
        { clubId, workoutId },
        { completed: data.completed, completedAt: data.completedAt, coach: data.coach }
      );
      await utils.community.clubs.workouts.completion.invalidate({ clubId, workoutId });
      toast.success(vars.completed === false ? "Completamento annullato." : "Allenamento segnato come completato.");
    },
    onError: (error, vars) => {
      toast.error(
        errorToastMessage(
          error,
          vars.completed === false
            ? "Non riesco ad annullare il completamento."
            : "Non riesco a segnare l'allenamento come completato."
        )
      );
    },
  });

  const detailWorkout = (workoutDetailQuery.data as any)?.workout ?? null;
  const detailPlan = useMemo(() => parseWorkoutPlan(detailWorkout?.workoutJson), [detailWorkout?.workoutJson]);

  const handlePrintWorkout = () => {
    if (typeof window === "undefined") return;
    window.print();
  };

  const setCompleted = (completed: boolean) => {
    if (!hasValidWorkoutId) return;
    markCompletedMutation.mutate({ clubId, workoutId, completed });
  };
  const completion = completionQuery.data;
  const completionPending = markCompletedMutation.isPending || completionQuery.isPending;

  if (!match || !Number.isFinite(clubId)) return null;

  const backToList = `/community/club/${clubId}/workouts`;
  const access = clubAccess(clubQuery);
  if (access !== "member") {
    return (
      <AppLayout>
        <ClubAccessState
          access={access}
          clubId={clubId}
          loadingLabel="Caricamento dell'allenamento…"
          notMemberText={NOT_MEMBER_TEXT}
          onRetry={() => void clubQuery.refetch()}
        />
      </AppLayout>
    );
  }

  // Before `isPending`: the query is disabled on purpose without a valid id.
  if (!hasValidWorkoutId) {
    return (
      <AppLayout>
        <ClubNotice backHref={backToList} backLabel="Torna agli allenamenti">
          Allenamento non trovato o non disponibile.
        </ClubNotice>
      </AppLayout>
    );
  }
  if (workoutDetailQuery.isPending) {
    return (
      <AppLayout>
        <LoadingSkeleton label="Caricamento dell'allenamento…" count={3} itemClassName="h-24 w-full rounded-2xl" />
      </AppLayout>
    );
  }
  if (!detailWorkout) {
    const errorCode = workoutDetailQuery.error?.data?.code;
    if (workoutDetailQuery.isError && errorCode === "FORBIDDEN") {
      return (
        <AppLayout>
          <ClubNotice backHref={`/community/club/${clubId}`}>{NOT_MEMBER_TEXT}</ClubNotice>
        </AppLayout>
      );
    }
    if (workoutDetailQuery.isError && errorCode !== "NOT_FOUND") {
      return (
        <AppLayout>
          <LoadError onRetry={() => void workoutDetailQuery.refetch()} />
        </AppLayout>
      );
    }
    return (
      <AppLayout>
        <ClubNotice backHref={backToList} backLabel="Torna agli allenamenti">
          Allenamento non trovato o non disponibile.
        </ClubNotice>
      </AppLayout>
    );
  }

  const blocks = Array.isArray(detailPlan?.blocks) ? detailPlan.blocks : [];
  const coachNotes = Array.isArray(detailPlan?.coachNotes) ? detailPlan.coachNotes : [];
  const sessionDay = formatSessionDay(detailWorkout.sessionDate);
  const totalDistance = planFact(detailPlan?.totalDistance);
  const estimatedDuration = planFact(detailPlan?.estimatedDuration);

  return (
    <AppLayout>
      <style>
        {`
          @media print {
            @page { size: A4; margin: 12mm; }
            html, body {
              background: #ffffff !important;
              color: #111111 !important;
              font-family: "Helvetica Neue", Arial, sans-serif !important;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            body * { visibility: hidden; }
            .workout-print-root,
            .workout-print-root * { visibility: visible; }
            .workout-print-root {
              position: absolute;
              left: 0;
              top: 0;
              width: 100%;
              margin: 0 !important;
              padding: 0 !important;
            }
            .workout-print-hide { display: none !important; }
            .workout-print-root svg { display: none !important; }
            .workout-print-sheet {
              background: #ffffff !important;
              border: none !important;
              box-shadow: none !important;
              color: #111111 !important;
              padding: 0 !important;
              margin: 0 !important;
            }
            .workout-print-meta {
              display: block !important;
              margin: 0 0 8px 0 !important;
              font-size: 12px !important;
              line-height: 1.35 !important;
              color: #334155 !important;
            }
            .workout-print-title {
              margin: 4px 0 8px 0 !important;
              font-size: 32px !important;
              line-height: 1.15 !important;
              color: #0f172a !important;
            }
            .workout-print-description {
              margin: 0 0 10px 0 !important;
              font-size: 12px !important;
              line-height: 1.4 !important;
              color: #334155 !important;
            }
            .workout-print-block {
              background: #ffffff !important;
              border: 1px solid #cbd5e1 !important;
              border-radius: 8px !important;
              padding: 8px 10px !important;
              margin: 0 0 8px 0 !important;
              break-inside: avoid;
              page-break-inside: avoid;
            }
            .workout-print-block-title {
              margin: 0 0 6px 0 !important;
              font-size: 14px !important;
              line-height: 1.25 !important;
              color: #0f172a !important;
            }
            .workout-print-series {
              border: 1px solid #e2e8f0 !important;
              border-radius: 6px !important;
              padding: 6px 8px !important;
              margin: 6px 0 0 0 !important;
              break-inside: avoid;
              page-break-inside: avoid;
              background: #ffffff !important;
            }
            .workout-print-series-title {
              margin: 0 0 2px 0 !important;
              font-size: 12px !important;
              line-height: 1.3 !important;
              color: #0f172a !important;
            }
            .workout-print-series p,
            .workout-print-note-item {
              margin: 0 0 1px 0 !important;
              font-size: 11px !important;
              line-height: 1.35 !important;
              color: #111111 !important;
            }
            .workout-print-notes {
              margin-top: 10px !important;
            }
          }
        `}
      </style>
      <div className="workout-print-root">
        <section aria-labelledby={titleId} className="surface-panel p-4 workout-print-sheet">
          <h2
            id={titleId}
            className="break-words font-display text-[32px] font-bold leading-none workout-print-title"
          >
            {String(detailPlan?.title || detailWorkout.title || "Allenamento")}
          </h2>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground workout-print-meta">
            {sessionDay !== NO_VALUE ? (
              <li className="inline-flex items-center gap-1.5">
                <CalendarDays className="size-4" aria-hidden />
                {sessionDay}
              </li>
            ) : null}
            {totalDistance ? (
              <li className="inline-flex items-center gap-1.5">
                <Ruler className="size-4" aria-hidden />
                Distanza {totalDistance}
              </li>
            ) : null}
            {estimatedDuration ? (
              <li className="inline-flex items-center gap-1.5">
                <Clock3 className="size-4" aria-hidden />
                Durata stimata {estimatedDuration}
              </li>
            ) : null}
          </ul>
          {String(detailPlan?.description ?? "").trim().length > 0 ? (
            <p className="mt-3 text-sm text-foreground workout-print-description">{String(detailPlan?.description)}</p>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-2 workout-print-hide">
            {/* Announced when it changes; empty until the athlete has done it. */}
            <p role="status" className="inline-flex items-center gap-1.5 text-sm font-semibold text-success empty:hidden">
              {completion?.completed ? (
                <>
                  <CheckCircle2 className="size-4" aria-hidden />
                  {completion.completedAt ? `Completato ${formatTimeAgo(completion.completedAt)}` : "Completato"}
                </>
              ) : null}
            </p>
            {/* One button that changes label, so the focus stays on it after the tap; while saving
                it is aria-disabled, not disabled (a disabled button would drop the focus). */}
            <Button
              type="button"
              size="sm"
              variant={completion?.completed ? "ghost" : "default"}
              onClick={() => {
                if (completionPending) return;
                setCompleted(!completion?.completed);
              }}
              aria-disabled={completionPending || undefined}
              className={completionPending ? "opacity-50" : undefined}
            >
              {completion?.completed ? <Undo2 aria-hidden /> : <CheckCircle2 aria-hidden />}
              {markCompletedMutation.isPending
                ? "Salvataggio…"
                : completion?.completed
                  ? "Annulla completamento"
                  : "Segna completato"}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={handlePrintWorkout}>
              <Printer aria-hidden />
              Stampa
            </Button>
          </div>

          {completion?.coach ? (
            <section
              aria-labelledby={`${titleId}-done`}
              className="mt-4 border-t border-border pt-4 workout-print-hide"
            >
              <h3 id={`${titleId}-done`} className="text-[17px] font-bold">
                Fatto da {completion.coach.completedCount} su {completion.coach.memberCount}
              </h3>
              {completion.coach.members.length > 0 ? (
                <ul className="mt-2 space-y-2">
                  {completion.coach.members.map((member) => {
                    const name = member.name || member.username || "Nuotatore";
                    return (
                      <li key={member.userId} className="flex items-center gap-3">
                        <Avatar className="size-9">
                          <AvatarImage src={member.avatarUrl || undefined} alt="" />
                          <AvatarFallback className="text-xs font-semibold">{getInitials(name)}</AvatarFallback>
                        </Avatar>
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{name}</span>
                        <span className="text-sm text-muted-foreground">{formatTimeAgo(member.completedAt)}</span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">Nessuno l'ha ancora segnato come completato.</p>
              )}
            </section>
          ) : null}

          {blocks.length > 0 ? (
            blocks.map((block: any, blockIndex: number) => (
              <section
                key={`${detailWorkout.id}-${blockIndex}`}
                className="mt-4 border-t border-border pt-4 workout-print-block"
              >
                <h3 className="text-[17px] font-bold workout-print-block-title">
                  {String(block?.label ?? `Blocco ${blockIndex + 1}`)}
                </h3>
                {Array.isArray(block?.items) && block.items.length > 0 ? (
                  <ul className="mt-2 space-y-2">
                    {block.items.map((item: any, itemIndex: number) => {
                      const line = getWorkoutSeriesDisplay(item);
                      // Only what the plan says: no «n/d».
                      const facts = [
                        ["Stile", planFact(line.stroke)],
                        ["Serie", planFact(line.reps)],
                        ["Distanza serie", planFact(line.seriesDistance)],
                      ]
                        .filter(([, value]) => value)
                        .map(([label, value]) => `${label}: ${value}`);
                      const sendoff = planFact(line.sendoff);
                      return (
                        <li
                          key={`${detailWorkout.id}-${blockIndex}-${itemIndex}`}
                          className="rounded-xl bg-raised p-3 text-sm text-muted-foreground workout-print-series"
                        >
                          <p className="font-semibold text-foreground workout-print-series-title">
                            {String(item?.label ?? "Serie")}
                          </p>
                          {facts.length > 0 ? <p>{facts.join(" · ")}</p> : null}
                          {sendoff ? <p>Ripartenza: {sendoff}</p> : null}
                          {line.betweenSetsRest ? <p>Recupero prima della serie successiva: {line.betweenSetsRest}</p> : null}
                          {line.intensity ? <p>Intensità: {line.intensity}</p> : null}
                          {line.targetPace ? <p>Passo obiettivo: {line.targetPace}</p> : null}
                          {line.notes ? <p>Note: {line.notes}</p> : null}
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </section>
            ))
          ) : (
            <p className="mt-4 border-t border-border pt-4 text-sm text-muted-foreground">
              Dettagli dell'allenamento non disponibili.
            </p>
          )}

          {coachNotes.length > 0 ? (
            <section className="mt-4 border-t border-border pt-4 workout-print-block workout-print-notes">
              <h3 className="text-[17px] font-bold workout-print-block-title">Note del coach</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {coachNotes.map((note: string, index: number) => (
                  <li key={`${detailWorkout.id}-coach-note-${index}`} className="workout-print-note-item">
                    {note}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </section>
      </div>
    </AppLayout>
  );
}
