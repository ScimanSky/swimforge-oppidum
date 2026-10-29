import { assetUrl } from "@/lib/asset-base";
import { useParams } from "wouter";
import { useEffect, useId, useState, type ReactNode } from "react";
import { Clock } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import { Chip } from "@/components/corsia/Chip";
import { LoadError, LoadingSkeleton } from "@/components/corsia/LoadState";
import { Metric } from "@/components/corsia/Metric";
import { RankRow } from "@/components/corsia/RankRow";
import {
  CHALLENGE_DURATION_LABELS,
  CHALLENGE_TYPE_LABELS,
  averageChallengeProgress,
  bestChallengeProgress,
  challengeObjectiveLabel,
  challengeProgressParts,
  compareChallengeProgress,
} from "@/lib/challenges";
import { formatInteger } from "@/lib/format";
import { rankEntries } from "@/lib/ranking";

const sectionTitle = "text-[17px] font-bold";

function Notice({ children }: { children: ReactNode }) {
  return (
    <AppLayout>
      <p className="surface-panel p-4 text-center text-sm text-muted-foreground">{children}</p>
    </AppLayout>
  );
}

/** Profile badge tooltip: «Delfino (Livello 3)», without the parts that are missing. */
const profileBadgeTitle = (name?: string | null, level?: number | string | null) => {
  const label = name || "Badge";
  return level != null && level !== "" ? `${label} (Livello ${level})` : label;
};

export default function ChallengeDetail() {
  const params = useParams<{ id: string }>();
  const challengeId = parseInt(params.id || "0");
  const titleId = useId();
  const rankingId = useId();
  const { user } = useAuth();

  const challengeQuery = trpc.challenges.getById.useQuery({ id: challengeId });
  const challenge = challengeQuery.data;

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

  if (challengeQuery.isPending) {
    return (
      <AppLayout>
        <LoadingSkeleton
          label="Caricamento della sfida…"
          count={3}
          itemClassName="h-24 w-full rounded-2xl"
        />
      </AppLayout>
    );
  }
  if (!challenge && challengeQuery.isError && challengeQuery.error?.data?.code !== "NOT_FOUND") {
    return (
      <AppLayout>
        <LoadError onRetry={() => void challengeQuery.refetch()} />
      </AppLayout>
    );
  }
  if (!challenge) return <Notice>Sfida non trovata</Notice>;

  // Best first, whatever the server order (for pace the lowest wins, no data goes last).
  const compare = compareChallengeProgress(challenge.objective);
  const progressOf = (participant: { progress?: number | string | null }) =>
    Number(participant.progress ?? 0);
  const participants = [...(challenge.participants ?? [])].sort((a, b) =>
    compare(progressOf(a), progressOf(b))
  );
  const progressValues = participants.map(progressOf);
  // Ties share a position; who has no result yet (0, a pace without data) has none.
  const ranking = rankEntries(participants, (participant) => progressOf(participant));
  const bestProgress = bestChallengeProgress(challenge.objective, progressValues);
  const averageProgress = averageChallengeProgress(challenge.objective, progressValues);

  const progressParts = (value: number) => challengeProgressParts(challenge.objective, value);
  const statusLabel =
    challenge.status === "active" ? "Attiva" : challenge.status === "pending" ? "In arrivo" : "Conclusa";
  const showCountdown = challenge.status === "active" && timeLeft && timeLeft !== "Terminata";

  return (
    <AppLayout>
      <div className="space-y-6">
        <section aria-labelledby={titleId} className="surface-panel p-4">
          <div className="flex flex-wrap gap-2">
            <Chip tone={challenge.status === "active" ? "action" : "neutral"}>{statusLabel}</Chip>
            {CHALLENGE_TYPE_LABELS[challenge.type] ? <Chip>{CHALLENGE_TYPE_LABELS[challenge.type]}</Chip> : null}
            {CHALLENGE_DURATION_LABELS[challenge.duration] ? (
              <Chip>{CHALLENGE_DURATION_LABELS[challenge.duration]}</Chip>
            ) : null}
          </div>
          <h2
            id={titleId}
            className="mt-3 break-words font-display text-[32px] font-bold leading-none text-foreground"
          >
            {challenge.name}
          </h2>
          <p className="mt-2 text-sm font-semibold text-muted-foreground">
            {challengeObjectiveLabel(challenge.objective)}
          </p>
          {challenge.description ? (
            <p className="mt-3 text-sm text-foreground">{challenge.description}</p>
          ) : null}

          {showCountdown ? (
            <p className="mt-4 flex items-baseline gap-2 rounded-xl bg-raised px-3 py-2">
              <Clock className="size-4 shrink-0 self-center text-muted-foreground" aria-hidden />
              <span className="font-display text-xl font-bold tabular-nums">{timeLeft}</span>
              <span className="text-sm text-muted-foreground">rimanenti</span>
            </p>
          ) : null}

          <div className="mt-4 grid grid-cols-3 gap-4 border-t border-border pt-4">
            <Metric size="responsive" value={formatInteger(participants.length)} label="Partecipanti" />
            {participants.length > 0 ? (
              <>
                <Metric size="responsive" {...progressParts(bestProgress)} label="Miglior risultato" />
                <Metric size="responsive" {...progressParts(averageProgress)} label="Media del gruppo" />
              </>
            ) : null}
          </div>
        </section>

        <section aria-labelledby={rankingId}>
          <h2 id={rankingId} className={sectionTitle}>
            Classifica
          </h2>
          {participants.length > 0 ? (
            <ol aria-labelledby={rankingId} className="mt-3 space-y-2">
              {ranking.map(({ entry: participant, rank }) => {
                const userId = Number(participant.userId);
                const name = participant.username || "Nuotatore";
                const { value, unit } = progressParts(progressOf(participant));
                return (
                  <li key={participant.userId} value={rank ?? undefined}>
                    <RankRow
                      rank={rank}
                      name={name}
                      avatarUrl={participant.avatarUrl || participant.avatar_url}
                      value={value}
                      unit={unit}
                      href={Number.isFinite(userId) && userId > 0 ? `/u/${userId}` : undefined}
                      isCurrentUser={user != null && Number(user.id) === userId}
                      extra={
                        participant.profileBadgeUrl ? (
                          <img
                            src={assetUrl(participant.profileBadgeUrl)}
                            alt={participant.profileBadgeName || "Badge"}
                            title={profileBadgeTitle(
                              participant.profileBadgeName,
                              participant.profileBadgeLevel
                            )}
                            className="size-7 shrink-0 object-contain"
                          />
                        ) : null
                      }
                    />
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="mt-3 surface-panel p-4 text-center text-sm text-muted-foreground">
              Nessun partecipante ancora
            </p>
          )}
        </section>
      </div>
    </AppLayout>
  );
}
