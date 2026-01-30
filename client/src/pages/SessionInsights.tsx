import { useMemo, useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { ChevronLeft, Sparkles, Waves, Activity } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import MobileNav from "@/components/MobileNav";

function formatDistance(meters?: number | null) {
  if (!meters) return null;
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${meters} m`;
}

function formatTime(seconds?: number | null) {
  if (!seconds) return null;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

function formatDate(date?: string | null) {
  if (!date) return null;
  return new Date(date).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function SessionInsights() {
  const [page, setPage] = useState(0);
  const limit = 12;
  const listQuery = trpc.activityInsights.list.useQuery({ limit, offset: page * limit }, {
    staleTime: 60 * 1000,
  });

  const insights = useMemo(() => {
    const data = listQuery.data ?? [];
    const getTs = (item: any) => {
      const raw =
        item.generated_at ??
        item.generatedAt ??
        item.activity_date ??
        item.activityDate ??
        0;
      const ts = new Date(raw).getTime();
      return Number.isFinite(ts) ? ts : 0;
    };
    return [...data].sort((a: any, b: any) => getTs(b) - getTs(a));
  }, [listQuery.data]);

  return (
    <AppLayout showBubbles={true} bubbleIntensity="medium" className="text-white">
      <div className="min-h-screen overflow-x-hidden font-sans text-foreground relative pb-24">
        <div className="fixed inset-0 opacity-10 pointer-events-none -z-40">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.25),_transparent_60%)]" />
        </div>

        <div className="container py-8 md:py-12">
          <div className="flex flex-col gap-3 mb-8 md:flex-row md:items-center md:gap-4">
            <div className="flex items-center gap-3">
              <Link href="/coach">
                <Button variant="ghost" className="text-white/70 hover:text-white hover:bg-white/10 px-2">
                  <ChevronLeft className="h-5 w-5" />
                  <span className="ml-1 hidden sm:inline">Coach</span>
                </Button>
              </Link>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold text-white">Session IQ</h1>
                <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--gold)]/20 text-[var(--gold)] border border-[var(--gold)]/30">
                  Premium (free)
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 md:ml-auto">
              <div className="text-xs text-white/50">Analisi singole sessioni</div>
            </div>
          </div>

          <div className="grid lg:grid-cols-12 gap-6">
            <div className="lg:col-span-4 space-y-4">
              <div className="bg-card/40 border border-white/10 rounded-2xl p-5">
                <div className="flex items-center gap-2 text-cyan-200 text-xs uppercase tracking-wider mb-3">
                  <Sparkles className="h-4 w-4" />
                  Overview
                </div>
                <p className="text-white/70 text-sm leading-relaxed">
                  Qui trovi tutte le analisi AI generate per ogni sessione. Sono basate
                  sui dati della singola attività, senza usare la storia globale.
                </p>
                <div className="mt-4 flex items-center gap-2 text-xs text-white/60">
                  <Waves className="h-4 w-4 text-cyan-300" />
                  Nuove analisi compaiono dopo ogni sync.
                </div>
              </div>
            </div>

            <div className="lg:col-span-8 space-y-4">
              {insights.length === 0 && (
                <div className="bg-card/30 border border-white/10 rounded-2xl p-6 text-white/70">
                  Nessuna analisi disponibile. Sincronizza nuove attività per generare insight.
                </div>
              )}

              {insights.map((item: any, idx: number) => {
                const bullets = Array.isArray(item.bullets) ? item.bullets : (() => {
                  try {
                    return JSON.parse(item.bullets ?? "[]");
                  } catch {
                    return [];
                  }
                })();

                const tags = Array.isArray(item.tags) ? item.tags : (() => {
                  try {
                    return JSON.parse(item.tags ?? "[]");
                  } catch {
                    return [];
                  }
                })();

                const distance = formatDistance(item.activity_distance_meters);
                const duration = formatTime(item.activity_duration_seconds);
                const date = formatDate(item.activity_date);

                return (
                  <motion.div
                    key={`${item.id}-${idx}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-card/40 border border-white/10 rounded-2xl p-6 shadow-lg"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2 text-cyan-200 text-xs uppercase tracking-wider">
                        <Activity className="h-4 w-4" />
                        Analisi sessione
                      </div>
                      <div className="flex flex-wrap gap-3 text-xs text-white/60">
                        {date && <span>📅 {date}</span>}
                        {distance && <span>🏊 {distance}</span>}
                        {duration && <span>⏱ {duration}</span>}
                      </div>
                    </div>
                    <h2 className="text-lg font-semibold text-white mb-2">{item.title}</h2>
                    <p className="text-white/70 text-sm leading-relaxed mb-3">{item.summary}</p>
                    {bullets.length > 0 && (
                      <ul className="space-y-2 text-sm text-white/80 mb-3">
                        {bullets.map((bullet: string, bulletIdx: number) => (
                          <li key={bulletIdx} className="flex items-start gap-2">
                            <span className="text-cyan-300">•</span>
                            <span>{bullet}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {tags.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {tags.map((tag: string, tagIdx: number) => (
                          <span
                            key={tagIdx}
                            className="text-xs px-2 py-1 rounded-full bg-white/10 text-white/70"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </motion.div>
                );
              })}

              {insights.length >= limit && (
                <div className="flex justify-center pt-4">
                  <Button
                    variant="outline"
                    className="border-cyan-400/40 text-cyan-100 hover:bg-cyan-500/10"
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Carica altre
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
        <MobileNav />
      </div>
    </AppLayout>
  );
}
