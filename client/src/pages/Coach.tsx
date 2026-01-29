import { useMemo, useState } from "react";
import { trpc } from "../lib/trpc";
import { RefreshCw, Waves, Info, Clock, TrendingUp, ChevronLeft, Activity } from "lucide-react";
import { Link } from "wouter";
import MobileNav from "@/components/MobileNav";
import { AppLayout } from "@/components/AppLayout";

type WorkoutSection = {
  title: string;
  exercises: WorkoutExercise[];
  notes?: string;
};

type WorkoutExercise = {
  name: string;
  sets?: string;
  reps?: string;
  distance?: string;
  duration?: string;
  rest?: string;
  intensity?: string;
  equipment?: string;
  notes?: string;
};

type GeneratedWorkout = {
  type: "pool" | "dryland";
  title: string;
  description: string;
  duration: string;
  difficulty: string;
  sections: WorkoutSection[];
  coachNotes: string[];
};

export default function Coach() {
  const [activeTab, setActiveTab] = useState<"pool" | "dryland">("pool");
  const [forceRegenerate, setForceRegenerate] = useState(false);

  // Query for pool workout
  const poolWorkoutQuery = trpc.aiCoach.getPoolWorkout.useQuery(
    { forceRegenerate },
    { 
      enabled: activeTab === "pool",
      staleTime: forceRegenerate ? 0 : 1000 * 60 * 60 * 24, // No cache if regenerating
    }
  );

  // Query for dryland workout
  const drylandWorkoutQuery = trpc.aiCoach.getDrylandWorkout.useQuery(
    { forceRegenerate },
    { 
      enabled: activeTab === "dryland",
      staleTime: forceRegenerate ? 0 : 1000 * 60 * 60 * 24, // No cache if regenerating
    }
  );

  const currentQuery = activeTab === "pool" ? poolWorkoutQuery : drylandWorkoutQuery;
  const workout = currentQuery.data as GeneratedWorkout | undefined;
  
  // Use isFetching instead of isLoading to handle re-fetches correctly
  const isLoading = currentQuery.isFetching;
  const isRegenerating = forceRegenerate && isLoading;

  const { data: advanced } = trpc.statistics.getAdvanced.useQuery(
    { days: 30 },
    { staleTime: 24 * 60 * 60 * 1000 }
  );
  const { data: timeline } = trpc.statistics.getTimeline.useQuery(
    { days: 14 },
    { staleTime: 5 * 60 * 1000 }
  );
  const { data: garminStatus } = trpc.garmin.status.useQuery(undefined, { staleTime: 5 * 60 * 1000 });
  const { data: stravaStatus } = trpc.strava.status.useQuery(undefined, { staleTime: 5 * 60 * 1000 });

  const lastSyncDate = useMemo(() => {
    const garmin = garminStatus?.lastSync ? new Date(garminStatus.lastSync) : null;
    const strava = stravaStatus?.lastSync ? new Date(stravaStatus.lastSync) : null;
    if (!garmin && !strava) return null;
    if (garmin && strava) return garmin > strava ? garmin : strava;
    return garmin || strava;
  }, [garminStatus?.lastSync, stravaStatus?.lastSync]);

  const focusLabel = useMemo(() => {
    if (!advanced) return "Equilibrio";
    if (advanced.progressiveOverloadIndex !== null && advanced.progressiveOverloadIndex > 15) return "Potenza";
    if (advanced.aerobicCapacityScore !== null && advanced.aerobicCapacityScore < 55) return "Resistenza";
    if (advanced.technicalConsistencyIndex !== null && advanced.technicalConsistencyIndex < 60) return "Tecnica";
    if (advanced.strokeEfficiencyRating !== null && advanced.strokeEfficiencyRating < 60) return "Efficienza";
    return "Equilibrio";
  }, [advanced]);

  const focusColor = focusLabel === "Potenza"
    ? "text-red-400"
    : focusLabel === "Resistenza"
    ? "text-emerald-400"
    : focusLabel === "Tecnica"
    ? "text-cyan-400"
    : focusLabel === "Efficienza"
    ? "text-amber-400"
    : "text-[oklch(0.70_0.18_220)]";

  const conditionLabel = useMemo(() => {
    const rrs = advanced?.recoveryReadinessScore;
    if (rrs === null || rrs === undefined) return "—";
    if (rrs >= 70) return "Ottima";
    if (rrs >= 50) return "Buona";
    return "Recupero";
  }, [advanced?.recoveryReadinessScore]);

  const conditionColor = conditionLabel === "Ottima"
    ? "text-emerald-400"
    : conditionLabel === "Buona"
    ? "text-yellow-400"
    : "text-red-400";

  const sparklinePath = (values: number[] | undefined) => {
    if (!values || values.length < 2) return "";
    const max = Math.max(...values);
    const min = Math.min(...values);
    const width = 120;
    const height = 32;
    const range = max - min || 1;
    return values
      .map((v, i) => {
        const x = (i / (values.length - 1)) * width;
        const y = height - ((v - min) / range) * height;
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  };

  const distanceSpark = sparklinePath(timeline?.map((p) => p.distance));
  const paceSpark = sparklinePath(timeline?.map((p) => p.pace ?? 0));

  const handleRegenerate = async () => {
    setForceRegenerate(true);
    try {
      if (activeTab === "pool") {
        await poolWorkoutQuery.refetch();
      } else {
        await drylandWorkoutQuery.refetch();
      }
    } finally {
      setForceRegenerate(false);
    }
  };

  return (
    <AppLayout showBubbles={true} bubbleIntensity="medium" className="text-white">
    <div className="pb-20">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[oklch(0.12_0.035_250_/_0.95)] backdrop-blur-lg border-b border-[oklch(0.30_0.04_250)]">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Link href="/dashboard">
                <button className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                  <ChevronLeft className="w-5 h-5" />
                </button>
              </Link>
              <div className="flex items-center gap-3">
                <Waves className="w-6 h-6 text-[oklch(0.70_0.18_220)]" />
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold text-[oklch(0.95_0.01_220)]">AI Coach</h1>
                  <span className="px-2 py-0.5 text-[10px] rounded-full bg-[oklch(0.30_0.10_230)] text-[oklch(0.95_0.01_220)] border border-[oklch(0.40_0.10_230)]">
                    Premium
                  </span>
                </div>
              </div>
            </div>
            {workout && (
              <button
                onClick={handleRegenerate}
                disabled={isRegenerating}
                className="p-2 text-[oklch(0.70_0.18_220)] hover:bg-[oklch(0.18_0.03_250_/_0.55)] rounded-lg transition-colors disabled:opacity-50"
                title="Rigenera allenamento"
              >
                <RefreshCw
                  className={`w-5 h-5 ${isRegenerating ? "animate-spin" : ""}`}
                />
              </button>
            )}
          </div>
          <p className="text-[oklch(0.65_0.03_220)] text-sm mb-4">
            Allenamenti personalizzati basati sulle tue statistiche e metriche avanzate
          </p>

          {/* Tabs */}
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab("pool")}
              className={`flex-1 py-3 px-4 rounded-lg font-semibold transition-all flex items-center justify-center gap-2 ${
                activeTab === "pool"
                  ? "bg-gradient-to-r from-[oklch(0.70_0.18_220)] to-[oklch(0.70_0.15_195)] text-white shadow-lg"
                  : "bg-[oklch(0.18_0.03_250_/_0.55)] text-[oklch(0.65_0.03_220)] hover:bg-[oklch(0.20_0.03_250_/_0.55)]"
              }`}
            >
              <Waves className="w-5 h-5" />
              <span>In Vasca</span>
            </button>
            <button
              onClick={() => setActiveTab("dryland")}
              className={`flex-1 py-3 px-4 rounded-lg font-semibold transition-all flex items-center justify-center gap-2 ${
                activeTab === "dryland"
                  ? "bg-gradient-to-r from-[oklch(0.70_0.18_220)] to-[oklch(0.70_0.15_195)] text-white shadow-lg"
                  : "bg-[oklch(0.18_0.03_250_/_0.55)] text-[oklch(0.65_0.03_220)] hover:bg-[oklch(0.20_0.03_250_/_0.55)]"
              }`}
            >
              <Activity className="w-5 h-5" />
              <span>Fuori Vasca</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Pulse Header */}
        <div className="neon-card p-5 mb-6 bg-gradient-to-r from-[oklch(0.16_0.05_235_/_0.85)] to-[oklch(0.12_0.04_250_/_0.85)] border border-[oklch(0.30_0.08_235)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[oklch(0.30_0.12_230_/_0.4)] border border-[oklch(0.40_0.12_230)] flex items-center justify-center">
                <span className="text-lg">🧠</span>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-[oklch(0.95_0.02_220)]">Analisi Completata</span>
                  <span className="px-2 py-0.5 text-[10px] rounded-full bg-[oklch(0.25_0.12_230)] text-[oklch(0.95_0.01_220)] border border-[oklch(0.40_0.10_230)]">
                    Active
                  </span>
                </div>
                <div className="text-xs text-[oklch(0.65_0.05_220)]">
                  {lastSyncDate
                    ? `Ultimo sync: ${lastSyncDate.toLocaleDateString("it-IT")} • ${lastSyncDate.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`
                    : "Ultimo sync: non disponibile"}
                </div>
              </div>
            </div>

            <div className="flex-1 px-2">
              <div className="text-[10px] uppercase tracking-wider text-[oklch(0.60_0.05_250)] mb-2">
                Focus oggi
              </div>
              <div className="rounded-full bg-[oklch(0.20_0.04_250)] border border-[oklch(0.30_0.05_250)] h-9 flex items-center px-4">
                <div className={`text-sm font-semibold ${focusColor}`}>{focusLabel}</div>
              </div>
            </div>

            <div className="rounded-xl px-4 py-2 bg-[oklch(0.18_0.03_250)] border border-[oklch(0.25_0.03_250)]">
              <div className="text-[10px] uppercase tracking-wider text-[oklch(0.60_0.05_250)]">Condition</div>
              <div className={`text-sm font-semibold ${conditionColor}`}>{conditionLabel}</div>
            </div>
          </div>
        </div>
        {/* Loading State */}
        {isLoading && (
          <div className="neon-card p-12 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 border-4 border-[oklch(0.70_0.18_220)] border-t-transparent rounded-full animate-spin mb-6"></div>
            <p className="text-[oklch(0.75_0.03_220)] font-semibold">
              Generazione allenamento personalizzato...
            </p>
            <p className="text-[oklch(0.55_0.03_220)] text-sm mt-2">
              Sto analizzando le tue metriche avanzate
            </p>
            {/* Debug info for mobile users if stuck */}
            <p className="text-[oklch(0.40_0.03_220)] text-[10px] mt-8 opacity-30">
              Status: {currentQuery.status} | Fetching: {String(currentQuery.isFetching)}
            </p>
          </div>
        )}

        {/* Error State */}
        {currentQuery.isError && (
          <div className="neon-card p-6 text-center border-2 border-red-500/30">
            <p className="text-red-400 font-semibold mb-2">
              Errore nel caricamento dell'allenamento
            </p>
            <p className="text-red-300/70 text-sm mb-4">
              {currentQuery.error?.message || "Riprova più tardi"}
            </p>
            <button
              onClick={() => currentQuery.refetch()}
              className="px-4 py-2 bg-red-500/20 text-red-300 rounded-lg hover:bg-red-500/30 transition-colors border border-red-500/50"
            >
              Riprova
            </button>
          </div>
        )}

        {/* Workout Display */}
        {!isLoading && (
          <div className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              {/* Premium AI Insights */}
              <div className="neon-card p-6 bg-[oklch(0.14_0.04_240_/_0.75)] border border-[oklch(0.30_0.06_235)]">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-1 text-[10px] rounded-full bg-[oklch(0.25_0.12_230)] text-[oklch(0.95_0.01_220)] border border-[oklch(0.40_0.10_230)]">
                      Insights & Analisi
                    </span>
                    <span className="text-xs text-[oklch(0.70_0.05_220)]">Tactical Board</span>
                  </div>
                  <span className="text-[10px] text-[oklch(0.60_0.05_250)]">Ultime 24h</span>
                </div>
                {advanced?.insights?.length ? (
                  <>
                    <div className="space-y-4">
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-[oklch(0.60_0.05_250)] mb-1">
                          Il Verdetto
                        </div>
                        <div className="text-[oklch(0.95_0.02_220)] text-lg leading-relaxed font-semibold">
                          {advanced.insights[0]}
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-xl p-3 bg-[oklch(0.16_0.03_250_/_0.55)] border border-[oklch(0.28_0.03_250)]">
                          <div className="text-[10px] uppercase tracking-wider text-[oklch(0.60_0.05_250)] mb-2">
                            Evidence • Distanza
                          </div>
                          {distanceSpark ? (
                            <svg viewBox="0 0 120 32" className="w-full h-8">
                              <path d={distanceSpark} fill="none" stroke="#38bdf8" strokeWidth="2" />
                            </svg>
                          ) : (
                            <div className="text-xs text-[oklch(0.60_0.05_250)]">Dati non sufficienti</div>
                          )}
                        </div>
                        <div className="rounded-xl p-3 bg-[oklch(0.16_0.03_250_/_0.55)] border border-[oklch(0.28_0.03_250)]">
                          <div className="text-[10px] uppercase tracking-wider text-[oklch(0.60_0.05_250)] mb-2">
                            Evidence • Pace
                          </div>
                          {paceSpark ? (
                            <svg viewBox="0 0 120 32" className="w-full h-8">
                              <path d={paceSpark} fill="none" stroke="#22c55e" strokeWidth="2" />
                            </svg>
                          ) : (
                            <div className="text-xs text-[oklch(0.60_0.05_250)]">Dati non sufficienti</div>
                          )}
                        </div>
                      </div>

                      {advanced.insights[1] && (
                        <div className="rounded-xl p-3 text-sm text-[oklch(0.85_0.05_220)] bg-[oklch(0.16_0.03_250_/_0.55)] border border-[oklch(0.28_0.03_250)]">
                          {advanced.insights[1]}
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-[oklch(0.65_0.03_220)]">
                    Nessun insight disponibile. Completa più sessioni per ottenere analisi personalizzate.
                  </div>
                )}
                {advanced?.predictions && (
                  <div className="mt-4 rounded-xl p-3 bg-[oklch(0.18_0.03_250_/_0.55)] border border-[oklch(0.28_0.03_250)] text-xs text-[oklch(0.80_0.05_220)]">
                    Proiezione: {advanced.predictions.targetKm}km entro{" "}
                    {new Date(advanced.predictions.estimatedDate).toLocaleDateString("it-IT")} (
                    {advanced.predictions.daysRemaining}g)
                  </div>
                )}
              </div>

              {/* Workout Summary */}
              <div className="neon-card p-6">
                {workout ? (
                  <>
                    <h2 className="text-2xl font-bold text-[oklch(0.95_0.01_220)] mb-2">
                      {workout.title}
                    </h2>
                    <p className="text-[oklch(0.75_0.03_220)] mb-4">{workout.description}</p>

                    <div className="flex flex-wrap gap-4 text-sm">
                      <div className="flex items-center gap-2 text-[oklch(0.75_0.03_220)]">
                        <Clock className="w-4 h-4 text-[oklch(0.70_0.18_220)]" />
                        <span className="font-semibold">Durata:</span>
                        <span>{workout.duration}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[oklch(0.75_0.03_220)]">
                        <TrendingUp className="w-4 h-4 text-[oklch(0.70_0.18_220)]" />
                        <span className="font-semibold">Difficoltà:</span>
                        <span>{workout.difficulty}</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-[oklch(0.65_0.03_220)]">
                    Nessun allenamento disponibile al momento.
                  </div>
                )}
              </div>
            </div>

            {/* Workout Sections */}
            {workout && (
              <>
                {workout.sections.map((section, sectionIdx) => (
                  <div key={sectionIdx} className="neon-card p-6">
                    <h3 className="text-xl font-bold text-[oklch(0.95_0.01_220)] mb-4 pb-2 border-b-2 border-[oklch(0.70_0.18_220)]">
                      {section.title}
                    </h3>

                    <div className="space-y-4">
                      {section.exercises.map((exercise, exerciseIdx) => (
                        <div
                          key={exerciseIdx}
                          className="bg-[oklch(0.18_0.03_250_/_0.55)] rounded-lg p-4 hover:bg-[oklch(0.20_0.03_250_/_0.55)] transition-colors border border-[oklch(0.25_0.03_250)]"
                        >
                          <div className="font-semibold text-[oklch(0.95_0.01_220)] mb-2">
                            {exercise.name}
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm text-[oklch(0.75_0.03_220)] mb-2">
                            {exercise.sets && (
                              <div>
                                <span className="font-medium text-[oklch(0.85_0.01_220)]">Serie:</span> {exercise.sets}
                              </div>
                            )}
                            {exercise.reps && (
                              <div>
                                <span className="font-medium text-[oklch(0.85_0.01_220)]">Rip:</span> {exercise.reps}
                              </div>
                            )}
                            {exercise.distance && (
                              <div>
                                <span className="font-medium text-[oklch(0.85_0.01_220)]">Distanza:</span>{" "}
                                {exercise.distance}
                              </div>
                            )}
                            {exercise.duration && (
                              <div>
                                <span className="font-medium text-[oklch(0.85_0.01_220)]">Durata:</span>{" "}
                                {exercise.duration}
                              </div>
                            )}
                            {exercise.rest && (
                              <div>
                                <span className="font-medium text-[oklch(0.85_0.01_220)]">Ripartenza:</span>{" "}
                                {exercise.rest}
                              </div>
                            )}
                            {exercise.intensity && (
                              <div>
                                <span className="font-medium text-[oklch(0.85_0.01_220)]">Intensità:</span>{" "}
                                {exercise.intensity}
                              </div>
                            )}
                          </div>

                          {exercise.equipment && (
                            <div className="text-sm mb-2 px-3 py-1.5 bg-[oklch(0.70_0.18_220_/_0.2)] rounded-full inline-block border border-[oklch(0.70_0.18_220_/_0.4)]">
                              <span className="font-semibold text-[oklch(0.70_0.18_220)]">🏊 Attrezzo:</span>{" "}
                              <span className="text-[oklch(0.95_0.01_220)]">{exercise.equipment}</span>
                            </div>
                          )}

                          {exercise.notes && (
                            <div className="text-sm text-[oklch(0.75_0.03_220)] italic bg-[oklch(0.70_0.18_220_/_0.15)] rounded p-2 border-l-2 border-[oklch(0.70_0.18_220)]">
                              💡 {exercise.notes}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {section.notes && (
                      <div className="mt-4 p-3 bg-[oklch(0.70_0.18_220_/_0.15)] rounded-lg border-l-4 border-[oklch(0.70_0.18_220)]">
                        <div className="flex items-start gap-2">
                          <Info className="w-4 h-4 text-[oklch(0.70_0.18_220)] mt-0.5 flex-shrink-0" />
                          <p className="text-sm text-[oklch(0.75_0.03_220)]">{section.notes}</p>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {/* Coach Notes */}
                {workout.coachNotes && workout.coachNotes.length > 0 && (
                  <div className="neon-card p-6 bg-gradient-to-br from-[oklch(0.70_0.18_220_/_0.15)] to-[oklch(0.70_0.15_195_/_0.15)] border-2 border-[oklch(0.70_0.18_220_/_0.3)]">
                    <h3 className="text-xl font-bold text-[oklch(0.95_0.01_220)] mb-4 flex items-center gap-2">
                      <Info className="w-5 h-5 text-[oklch(0.70_0.18_220)]" />
                      Note del Coach
                    </h3>
                    <ul className="space-y-2">
                      {workout.coachNotes.map((note, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="text-[oklch(0.70_0.18_220)] font-bold">•</span>
                          <span className="text-[oklch(0.85_0.01_220)]">{note}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}

            {/* Cache Info */}
            <div className="text-center text-sm text-[oklch(0.55_0.03_220)]">
              <p>
                💡 Gli allenamenti vengono rigenerati ogni 24 ore in base alle tue
                ultime statistiche
              </p>
            </div>
          </div>
        )}
      </div>

      <MobileNav />
    </div>
    </AppLayout>
  );
}
