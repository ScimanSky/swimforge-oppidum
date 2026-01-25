import { useState } from "react";
import { trpc } from "../lib/trpc";
import { RefreshCw, Dumbbell, Waves, Info, Clock, TrendingUp, ChevronLeft } from "lucide-react";
import { Link } from "wouter";
import MobileNav from "@/components/MobileNav";

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
  const [isRegenerating, setIsRegenerating] = useState(false);

  // Query for pool workout
  const poolWorkoutQuery = trpc.aiCoach.getPoolWorkout.useQuery(
    { forceRegenerate: false },
    { enabled: activeTab === "pool", staleTime: 1000 * 60 * 60 * 24 } // 24 hours
  );

  // Query for dryland workout
  const drylandWorkoutQuery = trpc.aiCoach.getDrylandWorkout.useQuery(
    { forceRegenerate: false },
    { enabled: activeTab === "dryland", staleTime: 1000 * 60 * 60 * 24 } // 24 hours
  );

  const currentQuery = activeTab === "pool" ? poolWorkoutQuery : drylandWorkoutQuery;
  const workout = currentQuery.data as GeneratedWorkout | undefined;

  const handleRegenerate = async () => {
    setIsRegenerating(true);
    try {
      if (activeTab === "pool") {
        await poolWorkoutQuery.refetch();
      } else {
        await drylandWorkoutQuery.refetch();
      }
    } finally {
      setIsRegenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[oklch(0.15_0.03_250)] via-[oklch(0.12_0.035_250)] to-[oklch(0.10_0.04_250)] text-white pb-20">
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
                <Dumbbell className="w-6 h-6 text-[oklch(0.70_0.18_220)]" />
                <h1 className="text-xl font-bold text-[oklch(0.95_0.01_220)]">AI Coach</h1>
              </div>
            </div>
            {workout && (
              <button
                onClick={handleRegenerate}
                disabled={isRegenerating}
                className="p-2 text-[oklch(0.70_0.18_220)] hover:bg-[oklch(0.18_0.03_250)] rounded-lg transition-colors disabled:opacity-50"
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
                  : "bg-[oklch(0.18_0.03_250)] text-[oklch(0.65_0.03_220)] hover:bg-[oklch(0.20_0.03_250)]"
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
                  : "bg-[oklch(0.18_0.03_250)] text-[oklch(0.65_0.03_220)] hover:bg-[oklch(0.20_0.03_250)]"
              }`}
            >
              <Dumbbell className="w-5 h-5" />
              <span>Fuori Vasca</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Loading State */}
        {currentQuery.isLoading && (
          <div className="neon-card p-12 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[oklch(0.70_0.18_220)] mx-auto mb-4"></div>
            <p className="text-[oklch(0.75_0.03_220)] font-semibold">
              Generazione allenamento personalizzato...
            </p>
            <p className="text-[oklch(0.55_0.03_220)] text-sm mt-2">
              Sto analizzando le tue metriche avanzate
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
        {workout && !currentQuery.isLoading && (
          <div className="space-y-6">
            {/* Workout Header */}
            <div className="neon-card p-6">
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
            </div>

            {/* Workout Sections */}
            {workout.sections.map((section, sectionIdx) => (
              <div key={sectionIdx} className="neon-card p-6">
                <h3 className="text-xl font-bold text-[oklch(0.95_0.01_220)] mb-4 pb-2 border-b-2 border-[oklch(0.70_0.18_220)]">
                  {section.title}
                </h3>

                <div className="space-y-4">
                  {section.exercises.map((exercise, exerciseIdx) => (
                    <div
                      key={exerciseIdx}
                      className="bg-[oklch(0.18_0.03_250)] rounded-lg p-4 hover:bg-[oklch(0.20_0.03_250)] transition-colors border border-[oklch(0.25_0.03_250)]"
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
                            <span className="font-medium text-[oklch(0.85_0.01_220)]">Recupero:</span>{" "}
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
  );
}
