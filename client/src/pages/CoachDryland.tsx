import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Surface, SurfaceContent } from "@/components/ui/surface";
import { MetricOrb } from "@/components/metrics/MetricOrb";
import { Link } from "wouter";
import { motion } from "framer-motion";
import {
  ChevronLeft,
  Activity,
  Brain,
  Dumbbell,
  Timer,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Zap,
  Flame,
  RefreshCw,
} from "lucide-react";
import { trpc } from "../lib/trpc";
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

type InsightItem = {
  type: "warning" | "success" | "info";
  title: string;
  message: string;
  metric: string;
};

export default function CoachDryland() {
  const [dryRegenerate, setDryRegenerate] = useState(false);
  const [insightsRefreshing, setInsightsRefreshing] = useState(false);

  const drylandWorkoutQuery = trpc.aiCoach.getDrylandWorkout.useQuery(
    { forceRegenerate: dryRegenerate },
    {
      staleTime: dryRegenerate ? 0 : 1000 * 60 * 60 * 24,
    }
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

  const drylandWorkout = drylandWorkoutQuery.data as GeneratedWorkout | undefined;

  const lastSyncDate = useMemo(() => {
    const garmin = garminStatus?.lastSync ? new Date(garminStatus.lastSync) : null;
    const strava = stravaStatus?.lastSync ? new Date(stravaStatus.lastSync) : null;
    if (!garmin && !strava) return null;
    if (garmin && strava) return garmin > strava ? garmin : strava;
    return garmin || strava;
  }, [garminStatus?.lastSync, stravaStatus?.lastSync]);

  const focusLabel = useMemo(() => {
    if (!advanced) return "Forza & Cardio";
    if (advanced.progressiveOverloadIndex !== null && advanced.progressiveOverloadIndex > 15) return "Potenza";
    if (advanced.aerobicCapacityScore !== null && advanced.aerobicCapacityScore < 55) return "Cardio";
    if (advanced.technicalConsistencyIndex !== null && advanced.technicalConsistencyIndex < 60) return "Stabilità";
    return "Forza & Cardio";
  }, [advanced]);

  const conditionLabel = useMemo(() => {
    const rrs = advanced?.recoveryReadinessScore;
    if (rrs === null || rrs === undefined) return "—";
    if (rrs >= 70) return "Ottima";
    if (rrs >= 50) return "Buona";
    return "Recupero";
  }, [advanced?.recoveryReadinessScore]);

  const conditionClass = conditionLabel === "Ottima"
    ? "text-emerald-500 dark:text-cyan-200"
    : conditionLabel === "Buona"
    ? "text-amber-500 dark:text-amber-300"
    : "text-rose-500 dark:text-rose-300";
  const drylandOrbs = useMemo(() => {
    const recovery = advanced?.recoveryReadinessScore ?? 0;
    const focusProgress =
      focusLabel === "Potenza" ? 84 : focusLabel === "Cardio" ? 72 : focusLabel === "Stabilità" ? 68 : 76;
    const connectedCount = Number(Boolean(garminStatus?.connected)) + Number(Boolean(stravaStatus?.connected));

    return [
      {
        label: "Focus oggi",
        value: focusLabel,
        progress: focusProgress,
        helper: "Priorità training",
        icon: <Zap className="h-4 w-4" />,
        tone: "amber" as const,
      },
      {
        label: "Condition",
        value: conditionLabel,
        progress: Math.min(100, Math.round(recovery)),
        helper: `RRS ${recovery ? Math.round(recovery) : "N/D"}`,
        icon: <TrendingUp className="h-4 w-4" />,
        tone: "cyan" as const,
      },
      {
        label: "Connessioni",
        value: `${connectedCount}/2`,
        progress: Math.round((connectedCount / 2) * 100),
        helper: `${timeline?.length ?? 0} sessioni analizzate`,
        icon: <Activity className="h-4 w-4" />,
        tone: "lime" as const,
      },
    ];
  }, [advanced?.recoveryReadinessScore, focusLabel, conditionLabel, garminStatus?.connected, stravaStatus?.connected, timeline?.length]);

  const drylandInsights = useMemo<InsightItem[]>(() => {
    if (!advanced) return [];

    const cardioScore = advanced.aerobicCapacityScore;
    const strengthScore = advanced.progressiveOverloadIndex;
    const recoveryScore = advanced.recoveryReadinessScore;

    const cardioMetric = cardioScore === null || cardioScore === undefined ? "—" : `${Math.round(cardioScore)}/100`;
    const strengthMetric = strengthScore === null || strengthScore === undefined ? "—" : `${Math.round(strengthScore)} POI`;
    const recoveryMetric = recoveryScore === null || recoveryScore === undefined ? "—" : `RRS ${Math.round(recoveryScore)}`;

    return [
      {
        type: cardioScore !== null && cardioScore !== undefined && cardioScore < 55 ? "warning" : "success",
        title: "Capacità Cardio",
        message:
          cardioScore === null || cardioScore === undefined
            ? "Dati insufficienti: completa più sessioni per stimare la base aerobica."
            : cardioScore < 55
            ? "Base aerobica da rinforzare: inserisci blocchi cardio continui e recuperi controllati."
            : "Buona base cardio: mantieni volume costante e lavora su progressioni graduali.",
        metric: cardioMetric,
      },
      {
        type: strengthScore !== null && strengthScore !== undefined && strengthScore < 0 ? "warning" : "info",
        title: "Forza & Potenza",
        message:
          strengthScore === null || strengthScore === undefined
            ? "Mancano dati per la progressione di carico."
            : strengthScore < 0
            ? "Progressione ridotta: integra sessioni di forza con carichi gestibili e tecnica pulita."
            : "Buona spinta: continua con esercizi multiarticolari e controllo del core.",
        metric: strengthMetric,
      },
      {
        type: recoveryScore !== null && recoveryScore !== undefined && recoveryScore < 50 ? "warning" : "success",
        title: "Recupero & Prontezza",
        message:
          recoveryScore === null || recoveryScore === undefined
            ? "Recupero non stimabile: servono più dati HR/sonno."
            : recoveryScore < 50
            ? "Recupero basso: scegli intensità moderate e cura mobilità e sonno."
            : "Recupero solido: ottimo momento per una seduta secca intensa.",
        metric: recoveryMetric,
      },
    ];
  }, [advanced]);

  const handleRegenerateDryland = async () => {
    setDryRegenerate(true);
    try {
      await drylandWorkoutQuery.refetch();
    } finally {
      setDryRegenerate(false);
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
    return "bg-muted/50 text-muted-foreground border border-border/60 dark:bg-white/10 dark:text-white/70 dark:border-white/10";
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

  const renderCoachNotes = (notes?: string[]) =>
    notes?.length ? (
      <ul className="text-sm text-muted-foreground space-y-1">
        {notes.map((note, noteIdx) => (
          <li key={noteIdx} className="flex items-start gap-2">
            <span className="text-[var(--gold)]">•</span>
            <span>{note}</span>
          </li>
        ))}
      </ul>
    ) : (
      <div className="text-muted-foreground text-sm">Nota coach non disponibile.</div>
    );

  return (
    <AppLayout showBubbles={true} bubbleIntensity="medium">
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
          {/* Navigation & Header */}
          <div className="flex flex-col gap-3 mb-8 md:flex-row md:items-center md:gap-4">
            <div className="flex items-center gap-3">
              <Link href="/coach">
                <Button variant="ghost" className="text-muted-foreground hover:text-foreground hover:bg-muted/60 px-2">
                  <ChevronLeft className="h-5 w-5" />
                  <span className="ml-1 hidden sm:inline">Coach</span>
                </Button>
              </Link>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold text-foreground">Dryland Coach</h1>
                <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--gold)]/20 text-[var(--gold)] border border-[var(--gold)]/30">Premium</span>
              </div>
            </div>
            <div className="md:ml-auto w-full md:w-auto flex flex-col sm:flex-row gap-2">
              <Link href="/session-iq" className="w-full sm:w-auto">
                <Button variant="outline" className="w-full sm:w-auto border-[var(--gold)]/40 text-[var(--gold)] hover:bg-[var(--gold)]/10">
                  Session IQ
                </Button>
              </Link>
              <Link href="/coach" className="w-full sm:w-auto">
                <Button variant="outline" className="w-full sm:w-auto border-cyan-400/40 text-cyan-700 dark:text-cyan-100 hover:bg-cyan-500/10">
                  Allenamento in Vasca
                </Button>
              </Link>
            </div>
          </div>

          {/* 1. Header "Pulse" */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-card/60 backdrop-blur-md border border-border/60 rounded-2xl p-6 mb-8 relative overflow-hidden"
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
                  <h2 className="text-xl font-bold text-foreground flex flex-wrap items-center gap-2">
                    Analisi Dryland Attiva
                    <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-400/30 whitespace-nowrap">
                      Active
                    </span>
                  </h2>
                  <p className="text-muted-foreground text-sm flex items-center gap-2 mt-1">
                    <Activity className="h-3 w-3" />
                    {lastSyncDate
                      ? `Ultimo sync: ${lastSyncDate.toLocaleDateString("it-IT")} • ${lastSyncDate.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`
                      : "Ultimo sync: non disponibile"}
                  </p>
                </div>
              </div>

              <div className="grid w-full gap-3 sm:grid-cols-3 md:w-auto">
                {drylandOrbs.map((item) => (
                  <MetricOrb
                    key={item.label}
                    label={item.label}
                    value={item.value}
                    progress={item.progress}
                    helper={item.helper}
                    icon={item.icon}
                    tone={item.tone}
                    size="sm"
                  />
                ))}
              </div>
            </div>
          </motion.div>

          <div className="grid lg:grid-cols-12 gap-8">
            {/* 2. Colonna Sinistra: AI Insights Cardio & Forza */}
            <div className="lg:col-span-4 space-y-6">
              <h3 className="text-xl font-bold text-foreground mb-4 flex items-center gap-2">
                <Dumbbell className="h-5 w-5 text-[var(--gold)]" />
                Insights Cardio & Forza
              </h3>

              {drylandInsights.length ? (
                drylandInsights.map((insight, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.1 }}
                  >
                    <Surface className="bg-card/50 backdrop-blur-sm border-border/60 hover:bg-card/60 transition-colors">
                      <SurfaceContent className="p-5">
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
                          <span className="text-xs font-mono bg-muted/40 px-2 py-1 rounded text-muted-foreground dark:bg-white/5 dark:text-white/70">
                            {insight.metric}
                          </span>
                        </div>
                        <h4 className="font-bold text-foreground mb-1">{insight.title}</h4>
                        <p className="text-sm text-muted-foreground leading-relaxed">{insight.message}</p>
                      </SurfaceContent>
                    </Surface>
                  </motion.div>
                ))
              ) : (
                <Surface className="bg-card/50 backdrop-blur-sm border-border/60">
                  <SurfaceContent className="p-5 text-sm text-muted-foreground">
                    Nessun insight disponibile. Completa più sessioni per ottenere analisi personalizzate.
                  </SurfaceContent>
                </Surface>
              )}

              {timeline?.length ? (
                <Surface className="bg-gradient-to-br from-purple-200/40 to-indigo-200/40 dark:from-purple-900/40 dark:to-indigo-900/40 border-purple-500/20">
                  <SurfaceContent className="p-5 text-center">
                    <p className="text-purple-700 dark:text-purple-200 text-sm mb-3">
                      Analizzati {timeline.length} allenamenti recenti
                    </p>
                    <Button
                      variant="outline"
                      onClick={handleRefreshInsights}
                      disabled={insightsRefreshing}
                      className="w-full border-purple-500/50 text-purple-700 dark:text-purple-300 hover:bg-purple-500/20 hover:text-purple-100"
                    >
                      <RefreshCw className={`h-4 w-4 mr-2 ${insightsRefreshing ? "animate-spin" : ""}`} />
                      Rigenera Insights
                    </Button>
                  </SurfaceContent>
                </Surface>
              ) : null}
            </div>

            {/* 3. Colonna Destra: Dryland Workout */}
            <div className="lg:col-span-8 space-y-8">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
                    <Dumbbell className="h-5 w-5 text-[var(--gold)]" />
                    Fuori Vasca (Dryland)
                  </h3>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleRegenerateDryland}
                    disabled={dryRegenerate || drylandWorkoutQuery.isFetching}
                    className="text-[var(--gold)] hover:text-foreground hover:bg-muted/60"
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${dryRegenerate ? "animate-spin" : ""}`} />
                    Rigenera
                  </Button>
                </div>

                <Surface className="bg-card/50 backdrop-blur-sm border-border/60 overflow-hidden">
                  <div className="bg-gradient-to-r from-[var(--gold)]/20 to-amber-200/30 dark:to-amber-900/30 p-6 border-b border-border/60 dark:border-white/5">
                    {drylandWorkout ? (
                      <div className="flex flex-wrap justify-between items-center gap-4">
                        <div>
                          <h2 className="text-2xl font-bold text-foreground mb-1">{drylandWorkout.title}</h2>
                          <div className="flex gap-4 text-sm text-[var(--gold)]/80">
                            <span className="flex items-center gap-1"><Timer className="h-4 w-4" /> {drylandWorkout.duration}</span>
                            <span className="flex items-center gap-1"><Flame className="h-4 w-4" /> {drylandWorkout.description}</span>
                          </div>
                        </div>
                        <div className="px-4 py-2 bg-red-500/20 border border-red-500/30 rounded-lg text-red-300 font-bold text-sm uppercase tracking-wide">
                          {drylandWorkout.difficulty}
                        </div>
                      </div>
                    ) : (
                      <div className="text-muted-foreground">Allenamento dryland non disponibile.</div>
                    )}
                  </div>

                  <SurfaceContent className="p-0">
                    {drylandWorkoutQuery.isFetching && (
                      <div className="p-5 text-muted-foreground">Sto preparando l'allenamento...</div>
                    )}
                    {drylandWorkoutQuery.isError && (
                      <div className="p-5 text-red-300">Errore nel caricamento dell'allenamento.</div>
                    )}
                    {drylandWorkout?.sections?.map((section, idx) => {
                      const sectionLabel = formatSectionTitle(section.title);
                      const pillClass = getSectionPillClass(section.title);
                      return (
                        <div
                          key={idx}
                          className="p-4 md:p-5 border-b border-border/60 dark:border-white/5 last:border-0 flex flex-col sm:flex-row gap-3 sm:gap-4 hover:bg-muted/40 dark:hover:bg-white/5 transition-colors"
                        >
                          <div className="w-full sm:w-56 lg:w-64 flex-shrink-0">
                            <span className={`inline-flex text-xs font-semibold tracking-wide px-2 py-1 rounded ${pillClass} leading-snug break-words`}>
                              {sectionLabel}
                            </span>
                          </div>
                          <div className="flex-1 space-y-2 text-foreground">
                            {section.exercises?.length ? (
                              section.exercises.map((exercise, exIdx) => {
                                const details = getExerciseDetails(exercise);
                                return (
                                  <div key={exIdx} className="rounded-lg bg-muted/40 dark:bg-white/5 px-3 py-2 border border-border/60 dark:border-white/5">
                                    <div className="font-medium">{exercise.name}</div>
                                    {details.length ? (
                                      <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                        {details.map((detail, detailIdx) => (
                                          <span key={detailIdx}>{detail}</span>
                                        ))}
                                      </div>
                                    ) : null}
                                    {exercise.notes && (
                                      <div className="mt-2 text-xs text-cyan-700 dark:text-cyan-100/80">💡 {exercise.notes}</div>
                                    )}
                                  </div>
                                );
                              })
                            ) : section.notes ? (
                              <div className="text-muted-foreground text-sm">{section.notes}</div>
                            ) : (
                              <div className="text-muted-foreground text-sm">Dettagli non disponibili</div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </SurfaceContent>
                </Surface>

                {drylandWorkout ? (
                  <Surface className="mt-6 bg-[var(--gold)]/10 border border-[var(--gold)]/30">
                    <SurfaceContent className="p-5 space-y-3">
                      <div className="text-xs uppercase tracking-wider text-[var(--gold)]">Nota Coach Dryland</div>
                      {renderCoachNotes(drylandWorkout.coachNotes)}
                    </SurfaceContent>
                  </Surface>
                ) : null}
              </div>
            </div>
          </div>
        </div>

      </div>
    </AppLayout>
  );
}
