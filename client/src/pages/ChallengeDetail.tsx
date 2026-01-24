import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { Trophy, ArrowLeft, Calendar, Target, Users, Medal } from "lucide-react";
import MobileNav from "@/components/MobileNav";

export default function ChallengeDetail() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const challengeId = parseInt(params.id || "0");

  const { data: challenge, isLoading } = trpc.challenges.getById.useQuery({ id: challengeId });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[oklch(0.20_0.05_220)] via-[oklch(0.15_0.03_220)] to-[oklch(0.10_0.02_220)] pb-24">
        <div className="container mx-auto px-4 py-8">
          <p className="text-center text-[oklch(0.60_0.03_220)]">Caricamento...</p>
        </div>
        <MobileNav />
      </div>
    );
  }

  if (!challenge) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[oklch(0.20_0.05_220)] via-[oklch(0.15_0.03_220)] to-[oklch(0.10_0.02_220)] pb-24">
        <div className="container mx-auto px-4 py-8">
          <p className="text-center text-[oklch(0.60_0.03_220)]">Sfida non trovata</p>
        </div>
        <MobileNav />
      </div>
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-[oklch(0.20_0.05_220)] via-[oklch(0.15_0.03_220)] to-[oklch(0.10_0.02_220)] pb-24">
      <div className="container mx-auto px-4 py-8 space-y-8">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/challenges")}
            className="text-[oklch(0.70_0.18_220)]"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-3xl font-bold text-[oklch(0.95_0.01_220)]">
            {challenge.name}
          </h1>
        </div>

        {/* Challenge Info */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="neon-card p-6 space-y-4"
        >
          <p className="text-[oklch(0.70_0.05_220)]">{challenge.description}</p>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-2 text-[oklch(0.60_0.03_220)]">
              <Target className="h-4 w-4" />
              <span className="text-sm">{typeLabels[challenge.type as keyof typeof typeLabels]}</span>
            </div>
            <div className="flex items-center gap-2 text-[oklch(0.60_0.03_220)]">
              <Trophy className="h-4 w-4" />
              <span className="text-sm">{objectiveLabels[challenge.objective as keyof typeof objectiveLabels]}</span>
            </div>
            <div className="flex items-center gap-2 text-[oklch(0.60_0.03_220)]">
              <Calendar className="h-4 w-4" />
              <span className="text-sm">{durationLabels[challenge.duration as keyof typeof durationLabels]}</span>
            </div>
            <div className="flex items-center gap-2 text-[oklch(0.60_0.03_220)]">
              <Users className="h-4 w-4" />
              <span className="text-sm">{challenge.participants?.length || 0} Partecipanti</span>
            </div>
          </div>
        </motion.div>

        {/* Leaderboard */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="neon-card p-6"
        >
          <h2 className="text-xl font-bold text-[oklch(0.95_0.01_220)] mb-4 flex items-center gap-2">
            <Medal className="h-5 w-5 text-[oklch(0.70_0.18_220)]" />
            Classifica
          </h2>

          <div className="space-y-3">
            {challenge.participants && challenge.participants.length > 0 ? (
              challenge.participants.map((participant, index) => (
                <motion.div
                  key={participant.userId}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="flex items-center gap-4 p-4 rounded-lg bg-[oklch(0.15_0.03_220)] border border-[oklch(0.25_0.05_220)]"
                >
                  {/* Rank */}
                  <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                    index === 0 ? 'bg-[oklch(0.70_0.18_200)] text-[oklch(0.95_0.01_220)]' :
                    index === 1 ? 'bg-[oklch(0.60_0.10_220)] text-[oklch(0.95_0.01_220)]' :
                    index === 2 ? 'bg-[oklch(0.50_0.08_30)] text-[oklch(0.95_0.01_220)]' :
                    'bg-[oklch(0.25_0.05_220)] text-[oklch(0.60_0.03_220)]'
                  }`}>
                    {index + 1}
                  </div>

                  {/* Profile Badge */}
                  <div className="relative w-10 h-10 flex-shrink-0">
                    {participant.profileBadgeUrl ? (
                      <img
                        src={participant.profileBadgeUrl}
                        alt={participant.profileBadgeName || 'Badge'}
                        className="w-full h-full object-contain"
                        title={`${participant.profileBadgeName} (Livello ${participant.profileBadgeLevel})`}
                      />
                    ) : (
                      <div 
                        className="w-full h-full rounded-full bg-[oklch(0.25_0.05_220)] flex items-center justify-center text-[oklch(0.60_0.03_220)] text-xs font-bold"
                        title="Novizio (Livello 1)"
                      >
                        1
                      </div>
                    )}
                  </div>

                  {/* Username */}
                  <span className="flex-1 text-[oklch(0.95_0.01_220)] font-medium">
                    {participant.username}
                  </span>

                  {/* Progress */}
                  <span className="text-[oklch(0.70_0.18_220)] font-bold">
                    {participant.progress?.toFixed(2) || 0}
                  </span>
                </motion.div>
              ))
            ) : (
              <p className="text-center text-[oklch(0.60_0.03_220)] py-8">
                Nessun partecipante ancora
              </p>
            )}
          </div>
        </motion.div>
      </div>

      <MobileNav />
    </div>
  );
}
