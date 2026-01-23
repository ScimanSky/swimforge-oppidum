import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { useLocation, Link, Redirect } from "wouter";
import MobileNav from "@/components/MobileNav";
import { useState } from "react";

type OrderBy = "level" | "totalXp" | "badges";

export default function Leaderboard() {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [orderBy, setOrderBy] = useState<OrderBy>("totalXp");

  const { data: leaderboard, isLoading } = trpc.leaderboard.get.useQuery(
    { orderBy, limit: 50 },
    { enabled: isAuthenticated }
  );

  // Redirect if not authenticated - use Redirect component instead of setLocation during render
  if (!authLoading && !isAuthenticated) {
    return <Redirect to="/" />;
  }

  // Get medal color for position
  const getMedalColor = (position: number) => {
    switch (position) {
      case 1:
        return "text-yellow-500";
      case 2:
        return "text-gray-400";
      case 3:
        return "text-amber-600";
      default:
        return "text-muted-foreground";
    }
  };

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
  const formatValue = (entry: any) => {
    if (orderBy === "badges") {
      return `${entry.badgeCount || 0} badge`;
    }
    if (orderBy === "level") {
      return `Lv. ${entry.profile?.level || entry.level || 1}`;
    }
    return `${(entry.profile?.totalXp || entry.totalXp || 0).toLocaleString()} XP`;
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-gradient-to-r from-[var(--navy)] to-[var(--navy-light)] text-white">
        <div className="container py-4">
          <div className="flex items-center gap-3">
            <Link href="/dashboard">
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/10">
                <ChevronLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="font-semibold text-lg">Classifica</h1>
              <p className="text-sm text-white/70">Sfida i tuoi compagni</p>
            </div>
          </div>
        </div>
      </header>

      <main className="container py-6 space-y-6">
        {/* Order Tabs */}
        <Tabs value={orderBy} onValueChange={(v) => setOrderBy(v as OrderBy)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="totalXp" className="flex items-center gap-1">
              <Zap className="h-4 w-4" />
              <span className="hidden sm:inline">XP</span>
            </TabsTrigger>
            <TabsTrigger value="level" className="flex items-center gap-1">
              <TrendingUp className="h-4 w-4" />
              <span className="hidden sm:inline">Livello</span>
            </TabsTrigger>
            <TabsTrigger value="badges" className="flex items-center gap-1">
              <Award className="h-4 w-4" />
              <span className="hidden sm:inline">Badge</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Leaderboard List */}
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(10)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {/* Top 3 Podium */}
            {leaderboard && leaderboard.length >= 3 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="grid grid-cols-3 gap-2 mb-6"
              >
                {/* Second Place */}
                <div className="flex flex-col items-center pt-8">
                  <div className="w-16 h-16 rounded-full bg-gray-100 border-4 border-gray-400 flex items-center justify-center mb-2 shadow-lg">
                    <span className="text-2xl font-bold text-gray-600">2</span>
                  </div>
                  <p className="text-sm font-medium text-center truncate w-full">
                    {leaderboard[1]?.userName || "Nuotatore"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatValue(leaderboard[1])}
                  </p>
                </div>

                {/* First Place */}
                <div className="flex flex-col items-center">
                  <Crown className="h-8 w-8 text-yellow-500 mb-1" />
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 border-4 border-yellow-500 flex items-center justify-center mb-2 shadow-xl">
                    <span className="text-3xl font-bold text-white">1</span>
                  </div>
                  <p className="text-sm font-bold text-center truncate w-full">
                    {leaderboard[0]?.userName || "Nuotatore"}
                  </p>
                  <p className="text-xs text-[var(--gold)] font-semibold">
                    {formatValue(leaderboard[0])}
                  </p>
                </div>

                {/* Third Place */}
                <div className="flex flex-col items-center pt-12">
                  <div className="w-14 h-14 rounded-full bg-amber-100 border-4 border-amber-600 flex items-center justify-center mb-2 shadow-lg">
                    <span className="text-xl font-bold text-amber-700">3</span>
                  </div>
                  <p className="text-sm font-medium text-center truncate w-full">
                    {leaderboard[2]?.userName || "Nuotatore"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatValue(leaderboard[2])}
                  </p>
                </div>
              </motion.div>
            )}

            {/* Rest of the list */}
            {leaderboard?.slice(3).map((entry, index) => {
              const position = index + 4;
              const isCurrentUser = entry.profile?.userId === user?.id;
              const profile = entry.profile || entry;

              return (
                <motion.div
                  key={profile.id || index}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <Card className={`${isCurrentUser ? "ring-2 ring-[var(--azure)] bg-[var(--azure)]/5" : ""}`}>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-4">
                        {/* Position */}
                        <div className="w-8 flex justify-center">
                          {getMedalIcon(position)}
                        </div>

                        {/* Avatar */}
                        <div 
                          className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold"
                          style={{ 
                            backgroundColor: profile.levelColor || (profile as any).profile?.levelColor || "#3b82f6" 
                          }}
                        >
                          {(entry.userName || "N")[0].toUpperCase()}
                        </div>

                        {/* Name & Level */}
                        <div className="flex-1 min-w-0">
                          <p className={`font-medium truncate ${isCurrentUser ? "text-[var(--azure)]" : "text-card-foreground"}`}>
                            {entry.userName || "Nuotatore"}
                            {isCurrentUser && " (Tu)"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Livello {profile.level || 1}
                          </p>
                        </div>

                        {/* Value */}
                        <div className="text-right">
                          <p className="font-bold text-[var(--gold)]">
                            {formatValue(entry)}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}

            {(!leaderboard || leaderboard.length === 0) && (
              <div className="text-center py-12 text-muted-foreground">
                <Trophy className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <p>Nessun nuotatore in classifica</p>
                <p className="text-sm mt-1">Sii il primo a guadagnare XP!</p>
              </div>
            )}
          </div>
        )}
      </main>

      <MobileNav />
    </div>
  );
}
