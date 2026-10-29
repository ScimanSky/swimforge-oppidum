import { AppLayout } from "@/components/AppLayout";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Metric } from "@/components/corsia/Metric";
import { Pager } from "@/components/corsia/Pager";
import { RankBadge, RankRow, RankValue } from "@/components/corsia/RankRow";
import { formatInteger, getInitials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Award, TrendingUp, Trophy, Zap } from "lucide-react";
import { Link, Redirect } from "wouter";
import { useEffect, useMemo, useState } from "react";

type OrderBy = "level" | "totalXp" | "badges";
type Period = "all" | "week" | "month";

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
    level: profile.level ?? entry.level ?? 1,
    totalXp: profile.totalXp ?? entry.totalXp ?? 0,
    badgeCount: entry.badgeCount ?? 0,
    periodXp: entry.periodXp ?? 0,
    periodBadgeCount: entry.badgeCount ?? 0,
  };
}

export default function Leaderboard() {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [orderBy, setOrderBy] = useState<OrderBy>("totalXp");
  const [period, setPeriod] = useState<Period>("all");
  const [listPage, setListPage] = useState(1);

  const { data: leaderboard, isLoading } = trpc.leaderboard.get.useQuery(
    { orderBy, period, limit: 50 },
    {
      enabled: isAuthenticated,
      staleTime: 15_000,
      refetchInterval: 30_000,
      refetchOnWindowFocus: true,
      refetchOnMount: "always",
    }
  );

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
  const podiumOffset = normalizedLeaderboard.length >= 3 ? 3 : 0;
  const podium = normalizedLeaderboard.slice(0, podiumOffset);
  const restEntries = normalizedLeaderboard.slice(podiumOffset);
  const restPageSize = 4;
  const restTotalPages = Math.max(1, Math.ceil(restEntries.length / restPageSize));
  const pagedRestEntries = useMemo(() => {
    const start = (listPage - 1) * restPageSize;
    return restEntries.slice(start, start + restPageSize);
  }, [restEntries, listPage]);

  useEffect(() => {
    setListPage(1);
  }, [period, orderBy]);

  useEffect(() => {
    if (listPage > restTotalPages) setListPage(restTotalPages);
  }, [listPage, restTotalPages]);

  // After every hook: an early return between hooks breaks the rules of hooks.
  if (!authLoading && !isAuthenticated) {
    return <Redirect to="/" />;
  }

  const isMe = (entry: NormalizedEntry) => user != null && String(entry.userId) === String(user.id);
  const totalPlayers = normalizedLeaderboard.length;
  const myIndex = normalizedLeaderboard.findIndex(isMe);
  const me = myIndex >= 0 ? normalizedLeaderboard[myIndex] : null;
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

        {isLoading ? (
          <div role="status" className="space-y-2">
            <span className="sr-only">Caricamento della classifica…</span>
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-2xl" aria-hidden />
            ))}
          </div>
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
                <Metric size="responsive" value={formatInteger(totalPlayers)} label="Nuotatori" />
                {me ? (
                  <>
                    <Metric size="responsive" value={`${myIndex + 1}°`} label="La tua posizione" />
                    <Metric
                      size="responsive"
                      tone={orderBy === "totalXp" ? "xp" : "default"}
                      value={valueParts(me).value}
                      unit={orderBy === "totalXp" ? "XP" : undefined}
                      label={myValueLabel}
                    />
                  </>
                ) : (
                  <p className="col-span-2 self-center text-sm text-muted-foreground">
                    Non sei ancora in classifica.
                  </p>
                )}
              </div>
            </section>

            {podium.length > 0 ? (
              <ol aria-label="Podio" className="surface-panel grid grid-cols-3 items-end gap-2 p-3">
                {podium.map((entry, index) => {
                  const rank = index + 1;
                  const current = isMe(entry);
                  const { value, unit } = valueParts(entry);
                  return (
                    <li
                      key={entry.userId}
                      className={cn("min-w-0", rank === 1 ? "order-2" : rank === 2 ? "order-1" : "order-3")}
                    >
                      <Link
                        href={`/u/${entry.userId}`}
                        className={cn(
                          "flex min-w-0 flex-col items-center gap-2 rounded-xl border p-2 text-center transition-colors",
                          current ? "border-action-text bg-raised" : "border-transparent hover:bg-raised",
                          rank === 1 ? "pb-4" : null
                        )}
                      >
                        <Avatar className={rank === 1 ? "size-20" : "size-14"}>
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
              <ol aria-label="Classifica" className="space-y-2">
                {pagedRestEntries.map((entry, index) => {
                  const position = podiumOffset + (listPage - 1) * restPageSize + index + 1;
                  return (
                    <li key={entry.id || position}>
                      <RankRow
                        rank={position}
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
              label="Pagine della classifica"
            />
          </>
        )}
      </div>
    </AppLayout>
  );
}
