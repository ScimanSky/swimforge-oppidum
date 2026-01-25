import { useState } from "react";
import { trpc } from "../lib/trpc";
import { RefreshCw, Dumbbell, Waves, Info, Clock, TrendingUp } from "lucide-react";

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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50 pb-24 md:pb-8">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-cyan-600 text-white px-6 py-8 shadow-lg">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3 mb-2">
            <Dumbbell className="w-8 h-8" />
            <h1 className="text-3xl font-bold">AI Coach</h1>
          </div>
          <p className="text-blue-100 text-sm">
            Allenamenti personalizzati basati sulle tue statistiche e metriche avanzate
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab("pool")}
            className={`flex-1 py-3 px-4 rounded-lg font-semibold transition-all flex items-center justify-center gap-2 ${
              activeTab === "pool"
                ? "bg-blue-600 text-white shadow-lg"
                : "bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            <Waves className="w-5 h-5" />
            <span>In Vasca</span>
          </button>
          <button
            onClick={() => setActiveTab("dryland")}
            className={`flex-1 py-3 px-4 rounded-lg font-semibold transition-all flex items-center justify-center gap-2 ${
              activeTab === "dryland"
                ? "bg-blue-600 text-white shadow-lg"
                : "bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            <Dumbbell className="w-5 h-5" />
            <span>Fuori Vasca</span>
          </button>
        </div>

        {/* Loading State */}
        {currentQuery.isLoading && (
          <div className="bg-white rounded-xl shadow-md p-12 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Generazione allenamento personalizzato...</p>
            <p className="text-sm text-gray-500 mt-2">
              Sto analizzando le tue metriche avanzate
            </p>
          </div>
        )}

        {/* Error State */}
        {currentQuery.isError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
            <p className="text-red-600 font-semibold mb-2">
              Errore nel caricamento dell'allenamento
            </p>
            <p className="text-red-500 text-sm mb-4">
              {currentQuery.error?.message || "Riprova più tardi"}
            </p>
            <button
              onClick={() => currentQuery.refetch()}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              Riprova
            </button>
          </div>
        )}

        {/* Workout Display */}
        {workout && !currentQuery.isLoading && (
          <div className="space-y-6">
            {/* Workout Header */}
            <div className="bg-white rounded-xl shadow-md p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">
                    {workout.title}
                  </h2>
                  <p className="text-gray-600">{workout.description}</p>
                </div>
                <button
                  onClick={handleRegenerate}
                  disabled={isRegenerating}
                  className="ml-4 p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
                  title="Rigenera allenamento"
                >
                  <RefreshCw
                    className={`w-5 h-5 ${isRegenerating ? "animate-spin" : ""}`}
                  />
                </button>
              </div>

              <div className="flex flex-wrap gap-4 text-sm">
                <div className="flex items-center gap-2 text-gray-700">
                  <Clock className="w-4 h-4 text-blue-600" />
                  <span className="font-semibold">Durata:</span>
                  <span>{workout.duration}</span>
                </div>
                <div className="flex items-center gap-2 text-gray-700">
                  <TrendingUp className="w-4 h-4 text-blue-600" />
                  <span className="font-semibold">Difficoltà:</span>
                  <span>{workout.difficulty}</span>
                </div>
              </div>
            </div>

            {/* Workout Sections */}
            {workout.sections.map((section, sectionIdx) => (
              <div
                key={sectionIdx}
                className="bg-white rounded-xl shadow-md p-6"
              >
                <h3 className="text-xl font-bold text-gray-900 mb-4 border-b-2 border-blue-600 pb-2">
                  {section.title}
                </h3>

                <div className="space-y-4">
                  {section.exercises.map((exercise, exerciseIdx) => (
                    <div
                      key={exerciseIdx}
                      className="bg-gray-50 rounded-lg p-4 hover:bg-gray-100 transition-colors"
                    >
                      <div className="font-semibold text-gray-900 mb-2">
                        {exercise.name}
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm text-gray-600 mb-2">
                        {exercise.sets && (
                          <div>
                            <span className="font-medium">Serie:</span> {exercise.sets}
                          </div>
                        )}
                        {exercise.reps && (
                          <div>
                            <span className="font-medium">Rip:</span> {exercise.reps}
                          </div>
                        )}
                        {exercise.distance && (
                          <div>
                            <span className="font-medium">Distanza:</span>{" "}
                            {exercise.distance}
                          </div>
                        )}
                        {exercise.duration && (
                          <div>
                            <span className="font-medium">Durata:</span>{" "}
                            {exercise.duration}
                          </div>
                        )}
                        {exercise.rest && (
                          <div>
                            <span className="font-medium">Recupero:</span>{" "}
                            {exercise.rest}
                          </div>
                        )}
                        {exercise.intensity && (
                          <div>
                            <span className="font-medium">Intensità:</span>{" "}
                            {exercise.intensity}
                          </div>
                        )}
                      </div>

                      {exercise.notes && (
                        <div className="text-sm text-gray-700 italic bg-blue-50 rounded p-2 border-l-2 border-blue-600">
                          💡 {exercise.notes}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {section.notes && (
                  <div className="mt-4 p-3 bg-blue-50 rounded-lg border-l-4 border-blue-600">
                    <div className="flex items-start gap-2">
                      <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-gray-700">{section.notes}</p>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Coach Notes */}
            {workout.coachNotes && workout.coachNotes.length > 0 && (
              <div className="bg-gradient-to-r from-blue-600 to-cyan-600 rounded-xl shadow-md p-6 text-white">
                <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                  <Info className="w-5 h-5" />
                  Note del Coach
                </h3>
                <ul className="space-y-2">
                  {workout.coachNotes.map((note, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-cyan-200 font-bold">•</span>
                      <span className="text-blue-50">{note}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Cache Info */}
            <div className="text-center text-sm text-gray-500">
              <p>
                💡 Gli allenamenti vengono rigenerati ogni 24 ore in base alle tue
                ultime statistiche
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
