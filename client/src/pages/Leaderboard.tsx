import { AppLayout } from "@/components/AppLayout";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LoadError, LoadingSkeleton } from "@/components/corsia/LoadState";
import { Metric } from "@/components/corsia/Metric";
import { Pager } from "@/components/corsia/Pager";
import { RankBadge, RankRow, RankValue } from "@/components/corsia/RankRow";
import { NO_VALUE, formatInteger, getInitials } from "@/lib/format";
import { rankEntries } from "@/lib/ranking";
import { cn } from "@/lib/utils";
import { Award, TrendingUp, Trophy, Zap } from "lucide-react";
import { Link, Redirect } from "wouter";
import { useRef, useState } from "react";
import { usePaged } from "@/hooks/usePaged";

type OrderBy = "level" | "totalXp" | "badges";
type Period = "all" | "week" | "month";
/** The server returns at most this many swimmers. */
const LEADERBOARD_LIMIT = 50;

// Helper to normalize leaderboard entry data from different query formats
interface NormalizedEntry {
  id: number;
  userId: string;
  userName: string;
  avatarUrl?: string;
  username?: string;
  level: number;
  totalXp: number;
  badgeCount?: number;
  periodXp?: number;
  periodBadgeCount?: number;
}

/** Postgres bigint SUM/COUNT arrive as strings («"1234"»): every number goes through here. */
const toNumber = (value: unknown, fallback = 0) => {
  const number = typeof value === "string" && value.trim() === "" ? Number.NaN : Number(value);
  return value != null && Number.isFinite(number) ? number : fallback;
};

function normalizeEntry(entry: any): NormalizedEntry {
  // Handle both formats: { profile: {...}, userName } and flat { userId, name, level, ... }
  const profile = entry.profile || entry;
  const userId = profile.userId ?? entry.userId ?? 0;
  const userName = entry.userName ?? entry.name ?? "Nuotatore";
  const avatarUrl = profile.avatarUrl ?? profile.avatar_url ?? entry.avatarUrl ?? entry.avatar_url ?? "";
  const username = profile.username ?? entry.username ?? "";
  
  return {
    id: profile.id ?? entry.id ?? 0,
    userId: String(userId),
    userName,
    avatarUrl: avatarUrl || undefined,
    username: username || undefined,
    level: toNumber(profile.level ?? entry.level, 1),
    totalXp: toNumber(profile.totalXp ?? entry.totalXp),
    badgeCount: toNumber(entry.badgeCount),
    periodXp: toNumber(entry.periodXp),
    periodBadgeCount: toNumber(entry.badgeCount),
  };
}

export default function Leaderboard() {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [orderBy, setOrderBy] = useState<OrderBy>("totalXp");
  const [period, setPeriod] = useState<Period>("all");
  const listRef = useRef<HTMLOListElement>(null);

  const leaderboardQuery = trpc.leaderboard.get.useQuery(
    { orderBy, period, limit: LEADERBOARD_LIMIT },
    {
      enabled: isAuthenticated,
      staleTime: 15_000,
      refetchInterval: 30_000,
      refetchOnWindowFocus: true,
      refetchOnMount: "always",
    }
  );
  const leaderboard = leaderboardQuery.data;
  // `isPending` also covers the query still disabled while auth loads (isLoading is false then).
  const loading = authLoading || leaderboardQuery.isPending;
  const failed = !leaderboard && leaderboardQuery.isError;

  // Number shown for an entry, by ranking and period.
  const numericValue = (entry: NormalizedEntry) => {
    if (orderBy === "badges") return period === "all" ? entry.badgeCount || 0 : entry.periodBadgeCount || 0;
    if (orderBy === "level") return entry.level;
    return period === "all" ? entry.totalXp : entry.periodXp || 0;
  };
  const valueParts = (entry: NormalizedEntry) => ({
    value: formatInteger(numericValue(entry)),
    unit: orderBy === "badges" ? "badge" : orderBy === "level" ? "livello" : "XP",
  });
  // The row subtitle shows what the value column does not.
  const subtitleFor = (entry: NormalizedEntry) =>
    orderBy === "level" ? `${formatInteger(entry.totalXp)} XP` : `Livello ${entry.level}`;

  // Normalize all entries
  const normalizedLeaderboard = leaderboard?.map(normalizeEntry) || [];
  // The list arrives sorted by the shown value: ties share a position (1, 1, 3), swimmers at 0
  // (every weekly row on a Monday) have none and come last.
  const rankedEntries = rankEntries(normalizedLeaderboard, numericValue);
  // The podium holds only swimmers with a result: none while nobody has scored yet.
  const podium = rankedEntries.slice(0, 3).filter(({ rank }) => rank !== null);
  const podiumOffset = podium.length;
  const restEntries = rankedEntries.slice(podiumOffset);
  const {
    page: listPage,
    setPage: setListPage,
    totalPages: restTotalPages,
    pageItems: pagedRestEntries,
    offset: restOffset,
  } = usePaged(restEntries, 4, [period, orderBy]);

  // After every hook: an early return between hooks breaks the rules of hooks.
  if (!authLoading && !isAuthenticated) {
    return <Redirect to="/" />;
  }

  const isMe = (entry: NormalizedEntry) => user != null && String(entry.userId) === String(user.id);
  const totalPlayers = normalizedLeaderboard.length;
  const atLimit = totalPlayers >= LEADERBOARD_LIMIT;
  const me = rankedEntries.find(({ entry }) => isMe(entry)) ?? null;
  const myValueLabel =
    orderBy === "badges" ? "I tuoi badge" : orderBy === "level" ? "Il tuo livello" : "I tuoi XP";

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <TabsList aria-label="Periodo" className="w-full sm:w-fit">
              <TabsTrigger value="all">Sempre</TabsTrigger>
              <TabsTrigger value="month">Mese</TabsTrigger>
              <TabsTrigger value="week">Settimana</TabsTrigger>
            </TabsList>
          </Tabs>
          <Tabs value={orderBy} onValueChange={(v) => setOrderBy(v as OrderBy)}>
            <TabsList aria-label="Ordina per" className="w-full sm:w-fit">
              <TabsTrigger value="totalXp">
                <Zap aria-hidden />
                XP
              </TabsTrigger>
              <TabsTrigger value="level">
                <TrendingUp aria-hidden />
                Livello
              </TabsTrigger>
              <TabsTrigger value="badges">
                <Award aria-hidden />
                Badge
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {loading ? (
          <LoadingSkeleton label="Caricamento della classifica…" count={6} />
        ) : failed ? (
          <LoadError onRetry={() => void leaderboardQuery.refetch()} />
        ) : totalPlayers === 0 ? (
          <div className="surface-panel flex flex-col items-center gap-2 p-6 text-center">
            <Trophy className="size-10 text-muted-foreground" aria-hidden />
            <h2 className="text-base font-bold">Nessun nuotatore in classifica</h2>
            <p className="text-sm text-muted-foreground">
              Completa la tua prima attività per apparire qui.
            </p>
          </div>
        ) : (
          <>
            <section aria-label="La tua posizione" className="surface-panel p-4">
              <div className="grid grid-cols-3 gap-4">
                {/* The server sends the first 50 only: never claim they are all the swimmers. */}
                <Metric
                  size="responsive"
                  value={formatInteger(totalPlayers)}
                  label={atLimit ? "Primi in classifica" : "In classifica"}
                />
                {me ? (
                  <>
                    <Metric
                      size="responsive"
                      value={me.rank !== null ? `${me.rank}°` : NO_VALUE}
                      label="La tua posizione"
                    />
                    <Metric
                      size="responsive"
                      tone={orderBy === "totalXp" ? "xp" : "default"}
                      value={valueParts(me.entry).value}
                      unit={orderBy === "totalXp" ? "XP" : undefined}
                      label={myValueLabel}
                    />
                  </>
                ) : (
                  <p className="col-span-2 self-center text-sm text-muted-foreground">
                    {atLimit
                      ? `Non sei ancora tra i primi ${LEADERBOARD_LIMIT}.`
                      : "Non sei ancora in classifica."}
                  </p>
                )}
              </div>
            </section>

            {podium.length > 0 ? (
              <ol aria-label="Podio" className="surface-panel grid grid-cols-3 items-end gap-2 p-3">
                {podium.map(({ entry, rank }, index) => {
                  const current = isMe(entry);
                  const { value, unit } = valueParts(entry);
                  return (
                    <li
                      key={entry.userId}
                      value={rank ?? undefined}
                      // Placed by list position (winner in the middle, also alone), whatever the ties.
                      className={cn(
                        "row-start-1 min-w-0",
                        index === 0 ? "col-start-2" : index === 1 ? "col-start-1" : "col-start-3"
                      )}
                    >
                      <Link
                        href={`/u/${entry.userId}`}
                        className={cn(
                          "flex min-w-0 flex-col items-center gap-2 rounded-xl border p-2 text-center transition-colors",
                          current ? "border-action-text bg-raised" : "border-transparent hover:bg-raised",
                          index === 0 ? "pb-4" : null
                        )}
                      >
                        <Avatar className={index === 0 ? "size-20" : "size-14"}>
                          <AvatarImage src={entry.avatarUrl || undefined} alt="" className="object-cover" />
                          <AvatarFallback className="bg-raised font-semibold">
                            {getInitials(entry.userName)}
                          </AvatarFallback>
                        </Avatar>
                        <RankBadge rank={rank} className="-mt-5" />
                        <span className="w-full truncate text-sm font-semibold">
                          {entry.userName}
                          {current ? <span className="sr-only"> (tu)</span> : null}
                        </span>
                        <RankValue value={value} unit={unit} />
                      </Link>
                    </li>
                  );
                })}
              </ol>
            ) : null}

            {pagedRestEntries.length > 0 ? (
              // Each `value` keeps the list position equal to the visible rank; no value without one.
              <ol ref={listRef} aria-label="Classifica" className="scroll-mt-20 space-y-2">
                {pagedRestEntries.map(({ entry, rank }, index) => {
                  const position = podiumOffset + restOffset + index;
                  return (
                    <li key={entry.id || position + 1} value={rank ?? undefined}>
                      <RankRow
                        rank={rank}
                        name={entry.userName}
                        avatarUrl={entry.avatarUrl}
                        subtitle={subtitleFor(entry)}
                        {...valueParts(entry)}
                        href={`/u/${entry.userId}`}
                        isCurrentUser={isMe(entry)}
                      />
                    </li>
                  );
                })}
              </ol>
            ) : null}
            <Pager
              page={listPage}
              totalPages={restTotalPages}
              onChange={setListPage}
              listRef={listRef}
              label="Pagine della classifica"
            />
          </>
        )}
      </div>
    </AppLayout>
  );
}
