import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "wouter";
import { motion } from "framer-motion";
import {
  ChevronLeft,
  Activity,
  Brain,
  Waves,
  Timer,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Zap,
  RefreshCw,
} from "lucide-react";
import { trpc } from "../lib/trpc";
import MobileNav from "@/components/MobileNav";
import { AppLayout } from "@/components/AppLayout";
import { useAuth } from "@/_core/hooks/useAuth";

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

type InsightItem = {
  type: "warning" | "success" | "info";
  title: string;
  message: string;
  metric: string;
};

export default function Coach() {
  const [poolRegenerate, setPoolRegenerate] = useState(false);
  const [insightsRefreshing, setInsightsRefreshing] = useState(false);
  const [showSkillModal, setShowSkillModal] = useState(false);

  const poolWorkoutQuery = trpc.aiCoach.getPoolWorkout.useQuery(
    { forceRegenerate: poolRegenerate },
    {
      staleTime: poolRegenerate ? 0 : 1000 * 60 * 60 * 24,
    }
  );
  const { user } = useAuth();
  const profileQuery = trpc.profile.get.useQuery(undefined, { staleTime: 60 * 1000 });
  const pendingSessionInsights = trpc.activityInsights.pending.useQuery(
    { limit: 3 },
    { staleTime: 60 * 1000 }
  );

  const advancedQuery = trpc.statistics.getAdvanced.useQuery(
    { days: 30 },
    { staleTime: 24 * 60 * 60 * 1000 }
  );
  const timelineQuery = trpc.statistics.getTimeline.useQuery(
    { days: 14 },
    { staleTime: 5 * 60 * 1000 }
  );
  const advanced = advancedQuery.data;
  const timeline = timelineQuery.data;
  const { data: garminStatus } = trpc.garmin.status.useQuery(undefined, { staleTime: 5 * 60 * 1000 });
  const { data: stravaStatus } = trpc.strava.status.useQuery(undefined, { staleTime: 5 * 60 * 1000 });

  const poolWorkout = poolWorkoutQuery.data as GeneratedWorkout | undefined;
  const profile = profileQuery.data as any;

  useEffect(() => {
    if (!profile || !user) return;
    if (!profile.aiSkillLastEvaluatedAt) return;
    const change = profile.aiSkillChange;
    if (!change || change === "unchanged") return;
    const key = `aiSkillSeen:${user.id}:${profile.aiSkillLastEvaluatedAt}`;
    if (localStorage.getItem(key)) return;
    setShowSkillModal(true);
  }, [profile, user]);

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

  const conditionLabel = useMemo(() => {
    const rrs = advanced?.recoveryReadinessScore;
    if (rrs === null || rrs === undefined) return "—";
    if (rrs >= 70) return "Ottima";
    if (rrs >= 50) return "Buona";
    return "Recupero";
  }, [advanced?.recoveryReadinessScore]);

  const conditionClass = conditionLabel === "Ottima"
    ? "text-cyan-200"
    : conditionLabel === "Buona"
    ? "text-amber-300"
    : "text-rose-300";

  const insights = useMemo<InsightItem[]>(() => {
    const raw = advanced?.insights ?? [];
    if (!raw.length) return [];
    const metrics = [
      advanced?.technicalConsistencyIndex !== null && advanced?.technicalConsistencyIndex !== undefined
        ? `TCI ${Math.round(advanced.technicalConsistencyIndex)}`
        : undefined,
      advanced?.swimmingEfficiencyIndex !== null && advanced?.swimmingEfficiencyIndex !== undefined
        ? `SEI ${Math.round(advanced.swimmingEfficiencyIndex)}`
        : undefined,
      advanced?.recoveryReadinessScore !== null && advanced?.recoveryReadinessScore !== undefined
        ? `RRS ${Math.round(advanced.recoveryReadinessScore)}`
        : undefined,
      advanced?.strokeEfficiencyRating !== null && advanced?.strokeEfficiencyRating !== undefined
        ? `SER ${Math.round(advanced.strokeEfficiencyRating)}`
        : undefined,
    ].filter(Boolean) as string[];

    return raw.slice(0, 3).map((message, idx) => {
      const type = idx === 0 ? "warning" : idx === 1 ? "success" : "info";
      const title = idx === 0 ? "Punto di attenzione" : idx === 1 ? "Punto di forza" : "Nota coach";
      return {
        type,
        title,
        message,
        metric: metrics[idx] ?? "—",
      };
    });
  }, [advanced]);

  const handleRegeneratePool = async () => {
    setPoolRegenerate(true);
    try {
      await poolWorkoutQuery.refetch();
    } finally {
      setPoolRegenerate(false);
    }
  };

  const handleRefreshInsights = async () => {
    setInsightsRefreshing(true);
    try {
      await Promise.all([advancedQuery.refetch(), timelineQuery.refetch()]);
    } finally {
      setInsightsRefreshing(false);
    }
  };

  const formatSectionTitle = (title: string) =>
    title
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/(^|\s)\S/g, (char) => char.toUpperCase());

  const getSectionPillClass = (title: string) => {
    const key = title.toLowerCase();
    if (key.includes("warm") || key.includes("riscald")) {
      return "bg-[var(--gold)]/15 text-[var(--gold)] border border-[var(--gold)]/40";
    }
    if (key.includes("main") || key.includes("principale")) {
      return "bg-cyan-500/15 text-cyan-200 border border-cyan-400/40";
    }
    if (key.includes("drill") || key.includes("tecnica") || key.includes("attivazione")) {
      return "bg-purple-500/15 text-purple-200 border border-purple-400/40";
    }
    if (key.includes("cool") || key.includes("defatic")) {
      return "bg-sky-500/15 text-sky-200 border border-sky-400/40";
    }
    return "bg-white/10 text-white/70 border border-white/10";
  };

  const getExerciseDetails = (exercise: WorkoutExercise) =>
    [
      exercise.sets && `Serie: ${exercise.sets}`,
      exercise.reps && `Rip: ${exercise.reps}`,
      exercise.distance && `Distanza: ${exercise.distance}`,
      exercise.duration && `Durata: ${exercise.duration}`,
      exercise.rest && `Ripartenza: ${exercise.rest}`,
      exercise.intensity && `Intensità: ${exercise.intensity}`,
      exercise.equipment && `Attrezzi: ${exercise.equipment}`,
    ].filter(Boolean) as string[];

  return (
    <AppLayout showBubbles={true} bubbleIntensity="medium" className="text-white">
      <div className="min-h-screen overflow-x-hidden font-sans text-foreground relative pb-24">
        {/* Background Image with low opacity */}
        <div className="fixed inset-0 opacity-10 pointer-events-none -z-40">
          <img
            src="/images/ai_coach_digital.webp"
            alt="Background"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[var(--navy)]/80 via-[var(--navy)]/50 to-[var(--navy)]" />
        </div>

        {/* Animated particles effect */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none -z-30">
          {[...Array(15)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-2 h-2 bg-white/20 rounded-full"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
              }}
              animate={{
                y: [0, -30, 0],
                opacity: [0.1, 0.3, 0.1],
              }}
              transition={{
                duration: 4 + Math.random() * 3,
                repeat: Infinity,
                delay: Math.random() * 2,
              }}
            />
          ))}
        </div>

        <div className="container py-8 md:py-12">
          {showSkillModal && profile && user && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
              <div className="relative max-w-lg w-full mx-4">
                <div className="absolute inset-0 bg-gradient-to-br from-[var(--gold)]/20 via-cyan-500/10 to-purple-500/20 rounded-3xl blur-2xl" />
                <div className="relative bg-gradient-to-br from-[oklch(0.23_0.07_220)] to-[oklch(0.12_0.05_220)] rounded-3xl p-6 border border-[var(--gold)]/30 shadow-2xl">
                  <div className="text-xs uppercase tracking-wider text-[var(--gold)] mb-2">Coach Update</div>
                  <h2 className="text-xl font-bold text-white mb-2">
                    Livello {profile.aiSkillLabel ?? "aggiornato"}
                  </h2>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-white/60 mb-3">
                    <span className="px-2 py-0.5 rounded-full bg-white/10 border border-white/10">
                      Stima AI settimanale
                    </span>
                    {profile.aiSkillConfidence !== null && profile.aiSkillConfidence !== undefined && (
                      <span className="px-2 py-0.5 rounded-full bg-white/10 border border-white/10">
                        Confidenza {profile.aiSkillConfidence}%
                      </span>
                    )}
                  </div>
                  <p className="text-white/70 text-sm leading-relaxed mb-4">
                    {profile.aiSkillMessage ??
                      "Il tuo livello stimato è stato aggiornato in base alle ultime sessioni."}
                  </p>
                  <Button
                    className="w-full bg-[var(--gold)] text-[var(--navy)] hover:bg-[var(--gold-light)]"
                    onClick={() => {
                      const key = `aiSkillSeen:${user.id}:${profile.aiSkillLastEvaluatedAt}`;
                      localStorage.setItem(key, "1");
                      setShowSkillModal(false);
                    }}
                  >
                    Continua
                  </Button>
                </div>
              </div>
            </div>
          )}
          {/* Navigation & Header */}
          <div className="flex flex-col gap-3 mb-8 md:flex-row md:items-center md:gap-4">
            <div className="flex items-center gap-3">
              <Link href="/dashboard">
                <Button variant="ghost" className="text-white/70 hover:text-white hover:bg-white/10 px-2">
                  <ChevronLeft className="h-5 w-5" />
                  <span className="ml-1 hidden sm:inline">Dashboard</span>
                </Button>
              </Link>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold text-white">AI Coach Dashboard</h1>
                <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--gold)]/20 text-[var(--gold)] border border-[var(--gold)]/30">Premium</span>
              </div>
            </div>
            <div className="md:ml-auto w-full md:w-auto flex flex-col sm:flex-row gap-2">
              <Link href="/session-iq" className="w-full sm:w-auto">
                <Button variant="outline" className="w-full sm:w-auto border-[var(--gold)]/40 text-[var(--gold)] hover:bg-[var(--gold)]/10">
                  Session IQ
                </Button>
              </Link>
              <Link href="/coach-dryland" className="w-full sm:w-auto">
                <Button variant="outline" className="w-full sm:w-auto border-cyan-400/40 text-cyan-100 hover:bg-cyan-500/10">
                  Coach Dryland
                </Button>
              </Link>
            </div>
          </div>

          {/* 1. Header "Pulse" */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-card/30 backdrop-blur-md border border-white/10 rounded-2xl p-6 mb-8 relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyan-500 to-transparent opacity-50 animate-pulse" />

            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full md:w-auto">
                <div className="relative">
                  <div className="absolute inset-0 bg-cyan-500 blur-lg opacity-40 animate-pulse" />
                  <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/30 flex items-center justify-center relative z-10">
                    <Brain className="h-8 w-8 text-cyan-400" />
                  </div>
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-bold text-white flex flex-wrap items-center gap-2">
                    Analisi Completata
                    <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-400/30 whitespace-nowrap">
                      Active
                    </span>
                  </h2>
                  <p className="text-white/60 text-sm flex items-center gap-2 mt-1">
                    <Activity className="h-3 w-3" />
                    {lastSyncDate
                      ? `Ultimo sync: ${lastSyncDate.toLocaleDateString("it-IT")} • ${lastSyncDate.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`
                      : "Ultimo sync: non disponibile"}
                  </p>
                </div>
              </div>

              <div className="flex gap-4 w-full md:w-auto">
                <div className="bg-white/5 rounded-lg p-3 px-5 flex-1 md:flex-none border border-white/5">
                  <div className="text-xs text-white/50 uppercase tracking-wider mb-1">Focus Oggi</div>
                  <div className="text-lg font-bold text-[var(--gold)] flex items-center gap-2">
                    <Zap className="h-4 w-4" />
                    {focusLabel}
                  </div>
                </div>
                <div className="bg-white/5 rounded-lg p-3 px-5 flex-1 md:flex-none border border-white/5">
                  <div className="text-xs text-white/50 uppercase tracking-wider mb-1">Condition</div>
                  <div className={`text-lg font-bold ${conditionClass} flex items-center gap-2`}>
                    <TrendingUp className="h-4 w-4" />
                    {conditionLabel}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          <div className="grid lg:grid-cols-12 gap-8">
            {/* 2. Colonna Sinistra: AI Insights */}
            <div className="lg:col-span-4 space-y-6">
              <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <Activity className="h-5 w-5 text-purple-400" />
                Insights & Analisi
              </h3>

              <div className="bg-gradient-to-br from-[oklch(0.24_0.08_230)] to-[oklch(0.14_0.06_230)] border border-[var(--gold)]/30 rounded-2xl p-5">
                <div className="text-xs uppercase tracking-wider text-[var(--gold)] mb-2">Session IQ</div>
                <div className="text-white font-semibold mb-1">Analisi sessioni disponibili</div>
                <p className="text-white/70 text-sm">
                  {pendingSessionInsights.data?.length
                    ? `Hai ${pendingSessionInsights.data.length} nuove analisi pronte.`
                    : "Nessuna nuova analisi, ma puoi rivedere le sessioni passate."}
                </p>
                <Link href="/session-iq">
                  <Button className="mt-4 w-full bg-[var(--gold)] text-[var(--navy)] hover:bg-[var(--gold-light)]">
                    Apri Session IQ
                  </Button>
                </Link>
              </div>

              {insights.length ? (
                insights.map((insight, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.1 }}
                  >
                    <Card className="bg-card/20 backdrop-blur-sm border-white/10 hover:bg-card/30 transition-colors">
                      <CardContent className="p-5">
                        <div className="flex justify-between items-start mb-2">
                          <div
                            className={`p-2 rounded-lg ${
                              insight.type === "warning"
                                ? "bg-orange-500/20 text-orange-400"
                                : insight.type === "success"
                                ? "bg-green-500/20 text-green-400"
                                : "bg-blue-500/20 text-blue-400"
                            }`}
                          >
                            {insight.type === "warning" ? (
                              <AlertCircle className="h-5 w-5" />
                            ) : insight.type === "success" ? (
                              <CheckCircle2 className="h-5 w-5" />
                            ) : (
                              <Activity className="h-5 w-5" />
                            )}
                          </div>
                          <span className="text-xs font-mono bg-white/5 px-2 py-1 rounded text-white/70">
                            {insight.metric}
                          </span>
                        </div>
                        <h4 className="font-bold text-white mb-1">{insight.title}</h4>
                        <p className="text-sm text-white/70 leading-relaxed">{insight.message}</p>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))
              ) : (
                <Card className="bg-card/20 backdrop-blur-sm border-white/10">
                  <CardContent className="p-5 text-sm text-white/70">
                    Nessun insight disponibile. Completa più sessioni per ottenere analisi personalizzate.
                  </CardContent>
                </Card>
              )}

              {timeline?.length ? (
                <Card className="bg-gradient-to-br from-purple-900/40 to-indigo-900/40 border-purple-500/20">
                  <CardContent className="p-5 text-center">
                    <p className="text-purple-200 text-sm mb-3">
                      Analizzati {timeline.length} allenamenti recenti
                    </p>
                    <Button
                      variant="outline"
                      onClick={handleRefreshInsights}
                      disabled={insightsRefreshing}
                      className="w-full border-purple-500/50 text-purple-300 hover:bg-purple-500/20 hover:text-purple-100"
                    >
                      <RefreshCw className={`h-4 w-4 mr-2 ${insightsRefreshing ? "animate-spin" : ""}`} />
                      Rigenera Insights
                    </Button>
                  </CardContent>
                </Card>
              ) : null}

            </div>

            {/* 3. Colonna Destra: Workout Plan */}
            <div className="lg:col-span-8 space-y-8">
              {/* Pool Workout */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <Waves className="h-5 w-5 text-cyan-400" />
                    Allenamento in Vasca
                  </h3>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleRegeneratePool}
                    disabled={poolRegenerate || poolWorkoutQuery.isFetching}
                    className="text-cyan-200 hover:text-white hover:bg-white/10"
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${poolRegenerate ? "animate-spin" : ""}`} />
                    Rigenera
                  </Button>
                </div>

                <Card className="bg-card/20 backdrop-blur-sm border-white/10 overflow-hidden">
                  <div className="bg-gradient-to-r from-cyan-900/40 to-blue-900/40 p-6 border-b border-white/5">
                    {poolWorkout ? (
                      <div className="flex flex-wrap justify-between items-center gap-4">
                        <div>
                          <h2 className="text-2xl font-bold text-white mb-1">{poolWorkout.title}</h2>
                          <div className="flex gap-4 text-sm text-cyan-200/80">
                            <span className="flex items-center gap-1"><Timer className="h-4 w-4" /> {poolWorkout.duration}</span>
                            <span className="flex items-center gap-1"><Waves className="h-4 w-4" /> {poolWorkout.description}</span>
                          </div>
                        </div>
                        <div className="px-4 py-2 bg-red-500/20 border border-red-500/30 rounded-lg text-red-400 font-bold text-sm uppercase tracking-wide">
                          {poolWorkout.difficulty}
                        </div>
                      </div>
                    ) : (
                      <div className="text-white/70">Allenamento in vasca non disponibile.</div>
                    )}
                  </div>

                  <CardContent className="p-0">
                    {poolWorkoutQuery.isFetching && (
                      <div className="p-5 text-white/60">Sto preparando l'allenamento...</div>
                    )}
                    {poolWorkoutQuery.isError && (
                      <div className="p-5 text-red-300">Errore nel caricamento dell'allenamento.</div>
                    )}
                    {poolWorkout?.sections?.map((section, idx) => {
                      const sectionLabel = formatSectionTitle(section.title);
                      const pillClass = getSectionPillClass(section.title);
                      return (
                        <div
                          key={idx}
                          className={`p-4 md:p-5 border-b border-white/5 last:border-0 flex flex-col sm:flex-row gap-3 sm:gap-4 hover:bg-white/5 transition-colors ${
                            section.title.toLowerCase().includes("main") ? "bg-cyan-500/5" : ""
                          }`}
                        >
                          <div className="w-full sm:w-56 lg:w-64 flex-shrink-0">
                            <span className={`inline-flex text-xs font-semibold tracking-wide px-2 py-1 rounded ${pillClass} leading-snug break-words`}>
                              {sectionLabel}
                            </span>
                          </div>
                          <div className="flex-1 space-y-2 text-white/90">
                            {section.exercises?.length ? (
                              section.exercises.map((exercise, exIdx) => {
                                const details = getExerciseDetails(exercise);
                                return (
                                  <div key={exIdx} className="rounded-lg bg-white/5 px-3 py-2 border border-white/5">
                                    <div className="font-medium">{exercise.name}</div>
                                    {details.length ? (
                                      <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs text-white/60">
                                        {details.map((detail, detailIdx) => (
                                          <span key={detailIdx}>{detail}</span>
                                        ))}
                                      </div>
                                    ) : null}

                                    {exercise.notes && (
                                      <div className="mt-2 text-xs text-cyan-100/80">💡 {exercise.notes}</div>
                                    )}
                                  </div>
                                );
                              })
                            ) : section.notes ? (
                              <div className="text-white/70 text-sm">{section.notes}</div>
                            ) : (
                              <div className="text-white/50 text-sm">Dettagli non disponibili</div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              </div>

            </div>
          </div>
        </div>

        <MobileNav />
      </div>
    </AppLayout>
  );
}
