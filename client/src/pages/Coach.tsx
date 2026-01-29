import { useState } from "react";
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
              <div className="neon-card p-6 bg-gradient-to-br from-[oklch(0.20_0.08_235_/_0.55)] to-[oklch(0.12_0.04_250_/_0.75)] border border-[oklch(0.35_0.08_235)]">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-1 text-[10px] rounded-full bg-[oklch(0.30_0.10_230)] text-[oklch(0.95_0.01_220)] border border-[oklch(0.40_0.10_230)]">
                      AI Insights
                    </span>
                    <span className="text-xs text-[oklch(0.70_0.05_220)]">Analisi Premium</span>
                  </div>
                  <span className="text-[10px] text-[oklch(0.60_0.05_250)]">Ultime 24h</span>
                </div>
                {advanced?.insights?.length ? (
                  <>
                    <div className="text-[oklch(0.95_0.02_220)] text-base leading-relaxed font-medium">
                      {advanced.insights[0]}
                    </div>
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      {advanced.insights.slice(1, 5).map((insight, idx) => (
                        <div
                          key={idx}
                          className="rounded-xl p-3 text-sm text-[oklch(0.85_0.05_220)] bg-[oklch(0.16_0.03_250_/_0.55)] border border-[oklch(0.28_0.03_250)]"
                        >
                          {insight}
                        </div>
                      ))}
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
