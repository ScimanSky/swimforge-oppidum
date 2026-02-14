import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Surface, SurfaceContent, SurfaceHeader, SurfaceTitle } from "@/components/ui/surface";
import { MetricOrb } from "@/components/metrics/MetricOrb";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { motion } from "framer-motion";
import { Trophy, ArrowLeft, Calendar, Target, Users, Medal, Clock } from "lucide-react";
import { useState, useEffect } from "react";
import { AppLayout } from "@/components/AppLayout";

export default function ChallengeDetail() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const challengeId = parseInt(params.id || "0");

  const { data: challenge, isLoading } = trpc.challenges.getById.useQuery({ id: challengeId });

  // Countdown timer
  const [timeLeft, setTimeLeft] = useState<string>("");

  useEffect(() => {
    if (!challenge) return;

    const updateCountdown = () => {
      const now = new Date();
      
      // Check if dates exist
      if (!challenge.end_date || !challenge.start_date) {
        setTimeLeft("Date non disponibili");
        return;
      }
      
      // Parse end date (API type is Date-like; new Date(...) is resilient to string/Date)
      let endDate: Date = new Date(challenge.end_date);
      
      // Check if date is valid - if not, calculate from start_date + duration
      if (isNaN(endDate.getTime())) {
        // Parse start date
        const startDate = new Date(challenge.start_date);
        if (isNaN(startDate.getTime())) {
          setTimeLeft("Data non valida");
          return;
        }
        
        // Calculate end date based on duration
        endDate = new Date(startDate);
        switch (challenge.duration) {
          case '3_days':
            endDate.setDate(endDate.getDate() + 3);
            break;
          case '1_week':
            endDate.setDate(endDate.getDate() + 7);
            break;
          case '2_weeks':
            endDate.setDate(endDate.getDate() + 14);
            break;
          case '1_month':
            endDate.setMonth(endDate.getMonth() + 1);
            break;
          default:
            console.error('Unknown duration:', challenge.duration);
            setTimeLeft("Data non valida");
            return;
        }
      }
      
      const diff = endDate.getTime() - now.getTime();

      if (diff <= 0) {
        setTimeLeft("Terminata");
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      if (days > 0) {
        setTimeLeft(`${days}g ${hours}h ${minutes}m`);
      } else if (hours > 0) {
        setTimeLeft(`${hours}h ${minutes}m ${seconds}s`);
      } else {
        setTimeLeft(`${minutes}m ${seconds}s`);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, [challenge]);

  if (isLoading) {
    return (
      <AppLayout>
        <div className="pb-8 lg:pb-2">
          <div className="container mx-auto px-4 py-8">
            <p className="text-center text-muted-foreground">Caricamento...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!challenge) {
    return (
      <AppLayout>
        <div className="pb-8 lg:pb-2">
          <div className="container mx-auto px-4 py-8">
            <p className="text-center text-muted-foreground">Sfida non trovata</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  const typeLabels = {
    pool: "Piscina",
    open_water: "Acque Libere",
    both: "Entrambi",
  };

  const objectiveLabels = {
    total_distance: "Distanza Totale",
    total_sessions: "Numero Sessioni",
    consistency: "Costanza",
    avg_pace: "Pace Medio",
    total_time: "Tempo Totale",
    longest_session: "Sessione Più Lunga",
  };

  const durationLabels = {
    "3_days": "3 Giorni",
    "1_week": "1 Settimana",
    "2_weeks": "2 Settimane",
    "1_month": "1 Mese",
  };

  const formatPace = (seconds: number) => {
    if (!Number.isFinite(seconds) || seconds <= 0) return "0:00 /100m";
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")} /100m`;
  };

  const formatProgress = (value: number) => {
    switch (challenge.objective) {
      case "total_distance":
      case "longest_session":
        return `${(value / 1000).toFixed(2)} km`;
      case "total_time":
        return `${(value / 3600).toFixed(2)} h`;
      case "avg_pace":
        return formatPace(value);
      case "total_sessions":
      case "consistency":
        return `${Math.round(value)}`;
      default:
        return value.toFixed(2);
    }
  };

  const handleOpenUserProfile = (userId: number) => {
    if (!Number.isFinite(userId) || userId <= 0) return;
    setLocation(`/u/${userId}`);
  };

  const participantsCount = challenge.participants?.length ?? 0;
  const progressValues = (challenge.participants ?? []).map((p) => Number(p.progress ?? 0));
  const bestProgress = progressValues.length ? Math.max(...progressValues) : 0;
  const averageProgress = progressValues.length
    ? progressValues.reduce((sum, value) => sum + value, 0) / progressValues.length
    : 0;
  const targetValue = Number((challenge as any).targetValue ?? (challenge as any).target_value ?? 0);

  const normalizeObjectiveProgress = (value: number) => {
    if (!Number.isFinite(value) || value <= 0) return 0;
    if (targetValue > 0) {
      if (challenge.objective === "avg_pace") {
        return Math.max(0, Math.min(100, Math.round((targetValue / value) * 100)));
      }
      return Math.max(0, Math.min(100, Math.round((value / targetValue) * 100)));
    }
    return Math.max(0, Math.min(100, Math.round(value)));
  };

  const challengeOrbs = [
    {
      label: "Partecipanti",
      value: participantsCount,
      progress: Math.min(100, Math.round((participantsCount / 24) * 100)),
      helper: "In gara",
      icon: <Users className="h-4 w-4" />,
      tone: "cyan" as const,
    },
    {
      label: "Miglior risultato",
      value: formatProgress(bestProgress || 0),
      progress: normalizeObjectiveProgress(bestProgress),
      helper: "Top score",
      icon: <Trophy className="h-4 w-4" />,
      tone: "lime" as const,
    },
    {
      label: "Media gruppo",
      value: formatProgress(averageProgress || 0),
      progress: normalizeObjectiveProgress(averageProgress),
      helper: "Andamento",
      icon: <Target className="h-4 w-4" />,
      tone: "amber" as const,
    },
    {
      label: "Stato sfida",
      value: challenge.status === "active" ? "Attiva" : challenge.status === "pending" ? "Pending" : "Chiusa",
      progress: challenge.status === "active" ? 100 : challenge.status === "pending" ? 40 : 0,
      helper: timeLeft && challenge.status === "active" ? timeLeft : "Timeline",
      icon: <Clock className="h-4 w-4" />,
      tone: "sky" as const,
    },
  ];

  return (
    <AppLayout>
      <div className="pb-10 lg:pb-2">
        <div className="container mx-auto px-4 py-6 lg:py-3 space-y-8 lg:space-y-3">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost-neon"
            size="icon"
            onClick={() => setLocation("/season/challenges")}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-3xl font-display font-bold neon-gradient-text">
            {challenge.name}
          </h1>
        </div>

        {/* Challenge Info */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          <Surface className="bg-card border-border glass-panel">
            <SurfaceContent className="space-y-4 p-6">
              <p className="text-muted-foreground">{challenge.description}</p>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Target className="h-4 w-4 text-primary" />
                  <span className="text-sm">
                    {typeLabels[challenge.type as keyof typeof typeLabels]}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Trophy className="h-4 w-4 text-primary" />
                  <span className="text-sm">
                    {objectiveLabels[challenge.objective as keyof typeof objectiveLabels]}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-4 w-4 text-primary" />
                  <span className="text-sm">
                    {durationLabels[challenge.duration as keyof typeof durationLabels]}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Users className="h-4 w-4 text-primary" />
                  <span className="text-sm">{challenge.participants?.length || 0} Partecipanti</span>
                </div>
              </div>

              {/* Countdown Timer */}
              {challenge.status === "active" && timeLeft && timeLeft !== "Terminata" && (
                <div className="mt-4 flex items-center justify-center gap-2 rounded-lg bg-primary/15 px-4 py-3">
                  <Clock className="h-5 w-5 text-primary" />
                  <span className="text-lg font-bold text-foreground">{timeLeft}</span>
                  <span className="text-sm text-muted-foreground">rimanenti</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 pt-2 sm:grid-cols-3 lg:grid-cols-4">
                {challengeOrbs.map((item) => (
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
            </SurfaceContent>
          </Surface>
        </motion.div>

        {/* Leaderboard */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="space-y-4"
        >
          <Surface className="bg-card border-border">
            <SurfaceHeader>
              <SurfaceTitle className="flex items-center gap-2 font-display">
                <Medal className="h-5 w-5 text-primary" />
                Classifica
              </SurfaceTitle>
            </SurfaceHeader>
            <SurfaceContent>
              <div className="space-y-3">
                {challenge.participants && challenge.participants.length > 0 ? (
                  challenge.participants.map((participant, index) => (
                    <motion.div
                      key={participant.userId}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="flex items-center gap-4 rounded-lg border border-border bg-background/60 p-4 cursor-pointer hover:bg-background/75 transition-colors"
                      role="button"
                      tabIndex={0}
                      onClick={() => handleOpenUserProfile(participant.userId)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          handleOpenUserProfile(participant.userId);
                        }
                      }}
                    >
                      <Badge
                        variant={
                          index === 0
                            ? "rank-gold"
                            : index === 1
                            ? "rank-silver"
                            : index === 2
                            ? "rank-bronze"
                            : "neon"
                        }
                        className="h-8 w-8 justify-center p-0 text-xs"
                      >
                        {index + 1}
	                      </Badge>

	                      <div className="flex items-center gap-2">
	                        <Avatar className="h-10 w-10">
	                          <AvatarImage
	                            src={participant.avatarUrl || participant.avatar_url || ""}
	                            alt={participant.username || "Nuotatore"}
	                          />
	                          <AvatarFallback>
	                            {participant.username?.[0]?.toUpperCase() || "U"}
	                          </AvatarFallback>
	                        </Avatar>
	                        {participant.profileBadgeUrl ? (
	                          <img
	                            src={participant.profileBadgeUrl}
	                            alt={participant.profileBadgeName || "Badge"}
	                            className="h-7 w-7 object-contain opacity-90"
	                            title={`${participant.profileBadgeName} (Livello ${participant.profileBadgeLevel})`}
	                          />
	                        ) : (
	                          <div
	                            className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground"
	                            title="Novizio (Livello 1)"
	                          >
	                            1
	                          </div>
	                        )}
	                      </div>

                      <span className="flex-1 font-medium text-foreground">
                        {participant.username}
                      </span>

                      <span className="font-bold text-primary">
                        {formatProgress(participant.progress || 0)}
                      </span>
                    </motion.div>
                  ))
                ) : (
                  <p className="py-8 text-center text-muted-foreground">
                    Nessun partecipante ancora
                  </p>
                )}
              </div>
            </SurfaceContent>
          </Surface>
        </motion.div>
        </div>
      </div>
    </AppLayout>
  );
}
