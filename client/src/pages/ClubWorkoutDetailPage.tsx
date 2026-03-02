import { useMemo } from "react";
import { Link, useRoute } from "wouter";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { getWorkoutSeriesDisplay, parseWorkoutPlan } from "@/lib/workout-plan";
import { ArrowLeft, CalendarDays, Clock3, Printer } from "lucide-react";

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

export default function ClubWorkoutDetailPage() {
  const [match, params] = useRoute("/community/club/:clubId/workouts/:workoutId");
  const clubId = Number(params?.clubId);
  const workoutId = Number(params?.workoutId);
  const hasValidWorkoutId = Number.isFinite(workoutId) && workoutId > 0;

  const clubQuery = trpc.community.clubs.get.useQuery(
    { clubId },
    { enabled: match && Number.isFinite(clubId) }
  );
  const workoutDetailQuery = trpc.community.clubs.workouts.getPublished.useQuery(
    { clubId, workoutId: hasValidWorkoutId ? workoutId : 0 },
    { enabled: match && Number.isFinite(clubId) && hasValidWorkoutId, retry: 1, refetchOnWindowFocus: false }
  );

  const detailWorkout = (workoutDetailQuery.data as any)?.workout ?? null;
  const detailPlan = useMemo(() => parseWorkoutPlan(detailWorkout?.workoutJson), [detailWorkout?.workoutJson]);

  const handlePrintWorkout = () => {
    if (typeof window === "undefined") return;
    window.print();
  };

  if (!match || !Number.isFinite(clubId)) return null;

  if (clubQuery.isLoading || workoutDetailQuery.isLoading) {
    return (
      <AppLayout>
        <div className="container py-6">
          <div className="surface-panel p-6 text-center text-muted-foreground">Caricamento workout...</div>
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

  if (!hasValidWorkoutId || !detailWorkout) {
    return (
      <AppLayout>
        <div className="container py-6 space-y-4">
          <Link href={`/community/club/${clubId}/workouts`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Torna ai workout club
          </Link>
          <div className="surface-panel p-6 text-center text-muted-foreground">Workout non trovato o non disponibile.</div>
        </div>
      </AppLayout>
    );
  }

  const blocks = Array.isArray(detailPlan?.blocks) ? detailPlan.blocks : [];
  const coachNotes = Array.isArray(detailPlan?.coachNotes) ? detailPlan.coachNotes : [];

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

      <div className="container py-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 workout-print-hide">
          <div>
            <Link href={`/community/club/${clubId}/workouts`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" /> Torna ai workout club
            </Link>
            <h1 className="mt-1 text-2xl font-display font-bold">Workout Club • {club.name}</h1>
            <p className="text-sm text-muted-foreground">Dettaglio completo workout pubblicato.</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">Membri</Badge>
            <Button type="button" size="sm" variant="outline-neon" onClick={handlePrintWorkout}>
              <Printer className="mr-1.5 h-4 w-4" />
              Stampa workout
            </Button>
          </div>
        </div>

        <div className="workout-print-root">
          <section className="surface-panel p-4 space-y-3 workout-print-sheet">
            <div className="flex items-center gap-2 text-muted-foreground workout-print-meta">
              <CalendarDays className="h-4 w-4" />
              <p className="text-sm">
                Data: {formatSessionDate(detailWorkout.sessionDate)} • Distanza: {String(detailPlan?.totalDistance ?? "n/d")}
              </p>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground workout-print-meta">
              <Clock3 className="h-4 w-4" />
              <p className="text-sm">Durata stimata: {String(detailPlan?.estimatedDuration ?? "n/d")}</p>
            </div>
            <h2 className="text-2xl font-display font-bold workout-print-title">
              {String(detailPlan?.title ?? detailWorkout.title ?? "Workout")}
            </h2>
            {String(detailPlan?.description ?? "").trim().length > 0 ? (
              <p className="text-sm text-muted-foreground workout-print-description">{String(detailPlan?.description)}</p>
            ) : null}

            {blocks.length > 0 ? (
              <div className="space-y-2">
                {blocks.map((block: any, blockIndex: number) => (
                  <div key={`${detailWorkout.id}-${blockIndex}`} className="rounded-xl border border-border/60 bg-card/35 p-3 workout-print-block">
                    <p className="text-sm font-semibold workout-print-block-title">{String(block?.label ?? `Blocco ${blockIndex + 1}`)}</p>
                    {Array.isArray(block?.items) && block.items.length > 0 ? (
                      <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                        {block.items.map((item: any, itemIndex: number) => {
                          const line = getWorkoutSeriesDisplay(item);
                          return (
                            <li key={`${detailWorkout.id}-${blockIndex}-${itemIndex}`} className="rounded-md border border-border/50 bg-background/40 p-2 workout-print-series">
                              <p className="font-medium text-foreground/90 workout-print-series-title">{String(item?.label ?? "Serie")}</p>
                              <p>
                                Stile: {String(line.stroke ?? "n/d")} • Serie: {line.reps} • Distanza serie: {line.seriesDistance}
                              </p>
                              <p>Ripartenza: {line.sendoff}</p>
                              {line.betweenSetsRest ? <p>Recupero prima prossima serie: {line.betweenSetsRest}</p> : null}
                              {line.intensity ? <p>Intensità: {line.intensity}</p> : null}
                              {line.targetPace ? <p>Pace target: {line.targetPace}</p> : null}
                              {line.notes ? <p>Note: {line.notes}</p> : null}
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Dettagli workout non disponibili.</p>
            )}

            {coachNotes.length > 0 ? (
              <section className="rounded-xl border border-border/60 bg-card/35 p-3 workout-print-block workout-print-notes">
                <h3 className="text-sm font-semibold workout-print-block-title">Note Coach</h3>
                <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                  {coachNotes.map((note: string, index: number) => (
                    <li key={`${detailWorkout.id}-coach-note-${index}`} className="workout-print-note-item">• {note}</li>
                  ))}
                </ul>
              </section>
            ) : null}
          </section>
        </div>
      </div>
    </AppLayout>
  );
}
