import { AppLayout } from "@/components/AppLayout";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { MetricOrb } from "@/components/metrics/MetricOrb";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { motion } from "framer-motion";
import {
  Trophy,
  Medal,
  Crown,
  ChevronLeft,
  Zap,
  Award,
  TrendingUp,
} from "lucide-react";
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

  // Redirect if not authenticated
  if (!authLoading && !isAuthenticated) {
    return <Redirect to="/" />;
  }

  // Get medal icon for position
  const getMedalIcon = (position: number) => {
    switch (position) {
      case 1:
        return <Crown className="h-6 w-6 text-yellow-500" />;
      case 2:
        return <Medal className="h-6 w-6 text-gray-400" />;
      case 3:
        return <Medal className="h-6 w-6 text-amber-600" />;
      default:
        return (
          <span className="w-6 h-6 flex items-center justify-center text-sm font-bold text-muted-foreground">
            {position}
          </span>
        );
    }
  };

  // Format value based on orderBy
  const formatValue = (entry: NormalizedEntry): string => {
    if (orderBy === "badges") {
      const value = period === "all" ? entry.badgeCount || 0 : entry.periodBadgeCount || 0;
      return `${value} badge`;
    }
    if (orderBy === "level") {
      return `Lv. ${entry.level}`;
    }
    const xpValue = period === "all" ? entry.totalXp : entry.periodXp || 0;
    return `${xpValue.toLocaleString()} XP`;
  };

  // Normalize all entries
  const normalizedLeaderboard = leaderboard?.map(normalizeEntry) || [];
  const podiumOffset = normalizedLeaderboard.length >= 3 ? 3 : 0;
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
  const summaryOrbs = useMemo(() => {
    const numericValue = (entry: NormalizedEntry) => {
      if (orderBy === "badges") return period === "all" ? entry.badgeCount || 0 : entry.periodBadgeCount || 0;
      if (orderBy === "level") return entry.level;
      return period === "all" ? entry.totalXp : entry.periodXp || 0;
    };
    const topValue = normalizedLeaderboard.length ? numericValue(normalizedLeaderboard[0]) : 0;
    const myIndex = normalizedLeaderboard.findIndex((entry) => String(entry.userId) === String(user?.id));
    const myRank = myIndex >= 0 ? myIndex + 1 : null;
    const myValue = myIndex >= 0 ? numericValue(normalizedLeaderboard[myIndex]) : 0;
    const totalPlayers = normalizedLeaderboard.length;

    return [
      {
        label: "Nuotatori",
        value: totalPlayers,
        progress: Math.min(100, Math.round((totalPlayers / 100) * 100)),
        helper: "In classifica",
        icon: <Trophy className="h-4 w-4" />,
        tone: "cyan" as const,
      },
      {
        label: "Top score",
        value: formatValue(normalizedLeaderboard[0] || normalizeEntry({})),
        progress:
          orderBy === "totalXp"
            ? Math.min(100, Math.round((topValue / 12000) * 100))
            : Math.min(100, Math.round((topValue / 120) * 100)),
        helper: normalizedLeaderboard[0]?.userName || "—",
        icon: <Crown className="h-4 w-4" />,
        tone: "lime" as const,
      },
      {
        label: "La tua posizione",
        value: myRank ? `#${myRank}` : "—",
        progress: myRank ? Math.min(100, Math.round(((totalPlayers - myRank + 1) / Math.max(totalPlayers, 1)) * 100)) : 0,
        helper: myRank ? formatValue(normalizedLeaderboard[myIndex]) : "Non in classifica",
        icon: <Medal className="h-4 w-4" />,
        tone: "amber" as const,
      },
      {
        label: "Il tuo valore",
        value: myRank ? formatValue(normalizedLeaderboard[myIndex]) : "—",
        progress:
          orderBy === "totalXp"
            ? Math.min(100, Math.round((myValue / 12000) * 100))
            : Math.min(100, Math.round((myValue / 120) * 100)),
        helper: orderBy === "totalXp" ? "XP" : orderBy === "level" ? "Livello" : "Badge",
        icon: <Zap className="h-4 w-4" />,
        tone: "sky" as const,
      },
    ];
  }, [normalizedLeaderboard, orderBy, period, user?.id]);

  return (
    <AppLayout showBubbles={true} bubbleIntensity="low">
    <div className="pb-12 lg:pb-2">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-gradient-to-r from-[var(--navy)] to-[var(--navy-light)] text-foreground">
        <div className="container py-4">
          <div className="flex items-center gap-3">
            <Link href="/season/challenges">
              <Button variant="ghost" size="icon" className="text-foreground hover:bg-muted/60">
                <ChevronLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="font-semibold text-lg">Classifica</h1>
              <p className="text-sm text-muted-foreground">Sfida i tuoi compagni</p>
            </div>
          </div>
        </div>
      </header>

      <main className="container py-5 lg:py-3 space-y-6 lg:space-y-3">
        {/* Period Tabs */}
        <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="all">Sempre</TabsTrigger>
            <TabsTrigger value="month">Mese</TabsTrigger>
            <TabsTrigger value="week">Settimana</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Order Tabs */}
        <Tabs value={orderBy} onValueChange={(v) => setOrderBy(v as OrderBy)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="totalXp" className="flex items-center gap-1">
              <Zap className="h-4 w-4" />
              <span className="hidden sm:inline">XP</span>
            </TabsTrigger>
            <TabsTrigger value="level" className="flex items-center gap-1">
              <TrendingUp className="h-4 w-4" />
              <span className="hidden sm:inline">Livello XP</span>
            </TabsTrigger>
            <TabsTrigger value="badges" className="flex items-center gap-1">
              <Award className="h-4 w-4" />
              <span className="hidden sm:inline">Badge</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {summaryOrbs.map((item) => (
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

        {/* Leaderboard List */}
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(10)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {/* Empty state */}
            {normalizedLeaderboard.length === 0 && (
              <div className="text-center py-12 space-y-3">
                <Trophy className="w-16 h-16 mx-auto text-[oklch(0.50_0.03_220)]" />
                <h3 className="text-lg font-semibold text-[oklch(0.85_0.05_220)]">Nessun nuotatore in classifica</h3>
                <p className="text-sm text-[oklch(0.65_0.03_220)]">Completa la tua prima attività per apparire qui!</p>
              </div>
            )}

            {/* Top 3 Podium */}
            {normalizedLeaderboard.length >= 3 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="grid grid-cols-3 gap-2 mb-6"
              >
                {/* Second Place */}
                <div className="flex flex-col items-center pt-8">
                  <Link href={`/u/${normalizedLeaderboard[1]?.userId ?? ""}`}>
                    <div className="relative mb-2 cursor-pointer">
                      <Avatar className="w-16 h-16 border-4 border-gray-400 shadow-lg">
                        <AvatarImage src={normalizedLeaderboard[1]?.avatarUrl || ""} alt={normalizedLeaderboard[1]?.userName || "Nuotatore"} />
                        <AvatarFallback>{(normalizedLeaderboard[1]?.userName?.[0] || "N").toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 border border-gray-400 text-xs font-bold text-gray-700">2</div>
                    </div>
                  </Link>
                  <Link href={`/u/${normalizedLeaderboard[1]?.userId ?? ""}`} className="text-sm font-medium text-center truncate w-full hover:underline">
                    {normalizedLeaderboard[1]?.userName || "Nuotatore"}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {normalizedLeaderboard[1] ? formatValue(normalizedLeaderboard[1]) : "—"}
                  </p>
                </div>

                {/* First Place */}
                <div className="flex flex-col items-center">
                  <Crown className="h-8 w-8 text-yellow-500 mb-1" />
                  <Link href={`/u/${normalizedLeaderboard[0]?.userId ?? ""}`}>
                    <div className="relative mb-2 cursor-pointer">
                      <Avatar className="w-20 h-20 border-4 border-yellow-500 shadow-xl">
                        <AvatarImage src={normalizedLeaderboard[0]?.avatarUrl || ""} alt={normalizedLeaderboard[0]?.userName || "Nuotatore"} />
                        <AvatarFallback>{(normalizedLeaderboard[0]?.userName?.[0] || "N").toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 border border-yellow-500 text-sm font-bold text-white">1</div>
                    </div>
                  </Link>
                  <Link href={`/u/${normalizedLeaderboard[0]?.userId ?? ""}`} className="text-sm font-bold text-center truncate w-full hover:underline">
                    {normalizedLeaderboard[0]?.userName || "Nuotatore"}
                  </Link>
                  <p className="text-xs text-[var(--gold)] font-semibold">
                    {normalizedLeaderboard[0] ? formatValue(normalizedLeaderboard[0]) : "—"}
                  </p>
                </div>

                {/* Third Place */}
                <div className="flex flex-col items-center pt-12">
                  <Link href={`/u/${normalizedLeaderboard[2]?.userId ?? ""}`}>
                    <div className="relative mb-2 cursor-pointer">
                      <Avatar className="w-14 h-14 border-4 border-amber-600 shadow-lg">
                        <AvatarImage src={normalizedLeaderboard[2]?.avatarUrl || ""} alt={normalizedLeaderboard[2]?.userName || "Nuotatore"} />
                        <AvatarFallback>{(normalizedLeaderboard[2]?.userName?.[0] || "N").toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 border border-amber-600 text-[10px] font-bold text-amber-700">3</div>
                    </div>
                  </Link>
                  <Link href={`/u/${normalizedLeaderboard[2]?.userId ?? ""}`} className="text-sm font-medium text-center truncate w-full hover:underline">
                    {normalizedLeaderboard[2]?.userName || "Nuotatore"}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {normalizedLeaderboard[2] ? formatValue(normalizedLeaderboard[2]) : "—"}
                  </p>
                </div>
              </motion.div>
            )}

            {/* Rest of the list */}
            {pagedRestEntries.map((entry, index) => {
              const position = podiumOffset + (listPage - 1) * restPageSize + index + 1;
              const isCurrentUser = String(entry.userId) === String(user?.id);

              return (
                <motion.div
                  key={entry.id || index}
                  initial={{ opacity: 0, x: -30, scale: 0.95 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  transition={{ delay: index * 0.05, type: "spring", stiffness: 200 }}
                  whileHover={{ scale: 1.02, x: 5 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Link href={`/u/${entry.userId}`}>
                  <div className={`surface-panel p-4 ${isCurrentUser ? "ring-2 ring-[var(--azure)] bg-[var(--azure)]/8" : ""} cursor-pointer`}>
                      <div className="flex items-center gap-4">
                        {/* Position */}
                        <div className="w-8 flex justify-center">
                          {getMedalIcon(position)}
                        </div>

                        {/* Avatar */}
                        <Avatar className="h-10 w-10 border border-border">
                          <AvatarImage src={entry.avatarUrl || ""} alt={entry.userName} />
                          <AvatarFallback>
                            {(entry.userName?.[0] || "S").toUpperCase()}
                          </AvatarFallback>
                        </Avatar>

                        {/* Name & Level */}
                        <div className="flex-1 min-w-0">
                          <p className={`font-medium truncate ${isCurrentUser ? "text-[var(--azure)]" : "text-card-foreground"}`}>
                            {entry.userName}
                            {isCurrentUser && " (Tu)"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Livello XP {entry.level}
                          </p>
                        </div>

                        {/* Value */}
                        <div className="text-right">
                          <p className="font-bold text-[var(--gold)]">
                            {formatValue(entry)}
                          </p>
                        </div>
                      </div>
                  </div>
                  </Link>
                </motion.div>
              );
            })}
            {restEntries.length > restPageSize && (
              <div className="mt-3 flex items-center justify-between rounded-xl border border-border/60 bg-card/50 px-3 py-2">
                <p className="text-xs text-muted-foreground">
                  Pagina {listPage} di {restTotalPages}
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline-neon"
                    onClick={() => setListPage((prev) => Math.max(1, prev - 1))}
                    disabled={listPage === 1}
                  >
                    Indietro
                  </Button>
                  <Button
                    size="sm"
                    variant="outline-neon"
                    onClick={() => setListPage((prev) => Math.min(restTotalPages, prev + 1))}
                    disabled={listPage === restTotalPages}
                  >
                    Avanti
                  </Button>
                </div>
              </div>
            )}

            {normalizedLeaderboard.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <Trophy className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <p>Nessun nuotatore in classifica</p>
                <p className="text-sm mt-1">Sii il primo a guadagnare XP!</p>
              </div>
            )}
          </div>
        )}
      </main>

    </div>
    </AppLayout>
  );
}
