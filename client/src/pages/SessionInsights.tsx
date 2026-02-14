import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { ChevronLeft, Sparkles, Waves, Activity, Calendar as CalendarIcon } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MetricOrb } from "@/components/metrics/MetricOrb";
import { Surface, SurfaceContent } from "@/components/ui/surface";
import { Calendar } from "@/components/ui/calendar";

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

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateFromKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export default function SessionInsights() {
  const [page, setPage] = useState(0);
  const [sessionView, setSessionView] = useState<"day" | "week">("day");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const limit = 12;
  const listQuery = trpc.activityInsights.list.useQuery({ limit, offset: page * limit }, {
    staleTime: 60 * 1000,
  });

  const sessionEntries = useMemo(() => {
    const data = listQuery.data ?? [];
    const normalizeDate = (value: any) => {
      if (!value) return null;
      if (value instanceof Date) return value;
      if (typeof value === "string") {
        const normalized = value.includes("T") ? value : value.replace(" ", "T");
        const date = new Date(normalized);
        return Number.isNaN(date.getTime()) ? null : date;
      }
      return null;
    };
    return [...data]
      .map((item: any) => {
        const date =
          normalizeDate(item.activity_date) ||
          normalizeDate(item.activityDate) ||
          normalizeDate(item.generated_at) ||
          normalizeDate(item.generatedAt);
        return {
          ...item,
          _date: date,
          _dateKey: date ? toDateKey(date) : null,
          _sort: date ? date.getTime() : 0,
        };
      })
      .sort((a, b) => b._sort - a._sort);
  }, [listQuery.data]);

  const sessionByDate = useMemo(() => {
    const map = new Map<string, any[]>();
    sessionEntries.forEach((entry: any) => {
      if (!entry._dateKey) return;
      const list = map.get(entry._dateKey) ?? [];
      list.push(entry);
      map.set(entry._dateKey, list);
    });
    return map;
  }, [sessionEntries]);

  const availableDateKeys = useMemo(
    () => Array.from(sessionByDate.keys()).sort((a, b) => (a > b ? -1 : 1)),
    [sessionByDate]
  );

  useEffect(() => {
    if (!availableDateKeys.length) return;
    if (!selectedDate) {
      setSelectedDate(dateFromKey(availableDateKeys[0]));
      return;
    }
    const key = toDateKey(selectedDate);
    if (!availableDateKeys.includes(key)) {
      setSelectedDate(dateFromKey(availableDateKeys[0]));
    }
  }, [availableDateKeys, selectedDate]);

  const weekDays = useMemo(() => {
    if (!selectedDate) return [];
    const date = new Date(selectedDate);
    const day = date.getDay();
    const offset = (day + 6) % 7;
    date.setDate(date.getDate() - offset);
    date.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }).map((_, index) => {
      const d = new Date(date);
      d.setDate(date.getDate() + index);
      return d;
    });
  }, [selectedDate]);

  const weekDateKeys = useMemo(
    () =>
      weekDays
        .map((day) => toDateKey(day))
        .filter((key) => sessionByDate.has(key)),
    [weekDays, sessionByDate]
  );

  const activeDateKey = selectedDate
    ? toDateKey(selectedDate)
    : availableDateKeys[0];
  const activeEntry = activeDateKey
    ? sessionByDate.get(activeDateKey)?.[0] ?? null
    : null;

  const activeBullets = useMemo(() => {
    if (!activeEntry) return [];
    if (Array.isArray(activeEntry.bullets)) return activeEntry.bullets;
    try {
      return JSON.parse(activeEntry.bullets ?? "[]");
    } catch {
      return [];
    }
  }, [activeEntry]);

  const activeTags = useMemo(() => {
    if (!activeEntry) return [];
    if (Array.isArray(activeEntry.tags)) return activeEntry.tags;
    try {
      return JSON.parse(activeEntry.tags ?? "[]");
    } catch {
      return [];
    }
  }, [activeEntry]);
  const sessionOrbs = useMemo(() => {
    const totalSessions = sessionEntries.length;
    const withDistance = sessionEntries
      .map((entry: any) => Number(entry.activity_distance_meters || 0))
      .filter((value) => Number.isFinite(value) && value > 0);
    const withDuration = sessionEntries
      .map((entry: any) => Number(entry.activity_duration_seconds || 0))
      .filter((value) => Number.isFinite(value) && value > 0);
    const avgDistance = withDistance.length
      ? withDistance.reduce((sum, value) => sum + value, 0) / withDistance.length
      : 0;
    const avgDuration = withDuration.length
      ? withDuration.reduce((sum, value) => sum + value, 0) / withDuration.length
      : 0;
    const selectedSessions =
      sessionView === "week"
        ? weekDateKeys.reduce(
            (sum, key) => sum + ((sessionByDate.get(key)?.length as number | undefined) ?? 0),
            0
          )
        : activeDateKey
          ? sessionByDate.get(activeDateKey)?.length ?? 0
          : 0;

    return [
      {
        label: "Analisi disponibili",
        value: totalSessions,
        progress: Math.min(100, Math.round((totalSessions / 50) * 100)),
        helper: "Storico caricato",
        icon: <Sparkles className="h-4 w-4" />,
        tone: "cyan" as const,
      },
      {
        label: "Sessioni selezionate",
        value: selectedSessions,
        progress: totalSessions > 0 ? Math.min(100, Math.round((selectedSessions / totalSessions) * 100)) : 0,
        helper: sessionView === "week" ? "Vista settimana" : "Vista giorno",
        icon: <CalendarIcon className="h-4 w-4" />,
        tone: "lime" as const,
      },
      {
        label: "Distanza media",
        value: avgDistance > 0 ? formatDistance(Math.round(avgDistance)) : "—",
        progress: Math.min(100, Math.round((avgDistance / 4500) * 100)),
        helper: "Per sessione",
        icon: <Waves className="h-4 w-4" />,
        tone: "amber" as const,
      },
      {
        label: "Durata media",
        value: avgDuration > 0 ? formatTime(Math.round(avgDuration)) : "—",
        progress: Math.min(100, Math.round((avgDuration / 5400) * 100)),
        helper: "Per sessione",
        icon: <Activity className="h-4 w-4" />,
        tone: "sky" as const,
      },
    ];
  }, [sessionEntries, sessionView, weekDateKeys, sessionByDate, activeDateKey]);

  return (
    <AppLayout>
      <div className="overflow-x-hidden font-sans text-foreground relative pb-12 lg:pb-2">
        <div className="container py-6 md:py-8 lg:py-3">
          <div className="flex flex-col gap-3 mb-8 md:flex-row md:items-center md:gap-4">
            <div className="flex items-center gap-3">
              <Link href="/coach">
                <Button variant="ghost-neon" className="px-2">
                  <ChevronLeft className="h-5 w-5" />
                  <span className="ml-1 hidden sm:inline">Coach</span>
                </Button>
              </Link>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold neon-gradient-text">Session IQ</h1>
                <Badge variant="neon" className="text-xs">
                  Premium (free)
                </Badge>
              </div>
            </div>
            <div className="flex items-center gap-2 md:ml-auto">
              <div className="text-xs text-muted-foreground">Analisi singole sessioni</div>
            </div>
          </div>

          <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {sessionOrbs.map((item) => (
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

          <div className="grid lg:grid-cols-12 gap-6">
            <div className="lg:col-span-4 space-y-4">
              <Surface className="bg-card border-border glass-panel">
                <SurfaceContent className="p-5">
                <div className="flex items-center gap-2 text-primary text-xs uppercase tracking-wider mb-3">
                  <Sparkles className="h-4 w-4" />
                  Overview
                </div>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  Qui trovi tutte le analisi AI generate per ogni sessione. Sono basate
                  sui dati della singola attività, senza usare la storia globale.
                </p>
                <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                  <Waves className="h-4 w-4 text-primary" />
                  Nuove analisi compaiono dopo ogni sync.
                </div>
                </SurfaceContent>
              </Surface>
            </div>

            <div className="lg:col-span-8 space-y-4">
              {sessionEntries.length === 0 && (
                <Surface className="bg-card border-border glass-panel">
                  <SurfaceContent className="p-6 text-muted-foreground">
                    Nessuna analisi disponibile. Sincronizza nuove attività per generare insight.
                  </SurfaceContent>
                </Surface>
              )}

              {sessionEntries.length > 0 && (
                <Surface className="bg-card border-border">
                  <SurfaceContent className="p-3 sm:p-4">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant={sessionView === "day" ? "neon" : "outline-neon"}
                      onClick={() => setSessionView("day")}
                    >
                      Giorno
                    </Button>
                    <Button
                      size="sm"
                      variant={sessionView === "week" ? "neon" : "outline-neon"}
                      onClick={() => setSessionView("week")}
                    >
                      Settimana
                    </Button>
                  </div>
                  <div className="mt-3">
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={setSelectedDate}
                      className="rounded-xl border border-border bg-background/60 [--cell-size:--spacing(6)] sm:[--cell-size:--spacing(7)] md:[--cell-size:--spacing(8)]"
                    />
                  </div>
                  {sessionView === "week" && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {weekDays.map((day) => {
                        const key = toDateKey(day);
                        if (!weekDateKeys.includes(key)) return null;
                        const label = day.toLocaleDateString("it-IT", {
                          weekday: "short",
                          day: "numeric",
                        });
                        const isActive = key === activeDateKey;
                        return (
                          <Button
                            key={key}
                            size="sm"
                            variant={isActive ? "neon" : "outline-neon"}
                            onClick={() => setSelectedDate(dateFromKey(key))}
                          >
                            {label}
                          </Button>
                        );
                      })}
                    </div>
                  )}
                  </SurfaceContent>
                </Surface>
              )}

              {activeEntry && (
                  <motion.div
                    key={activeEntry.id ?? activeDateKey}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-card border border-border rounded-2xl p-6 shadow-lg"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2 text-primary text-xs uppercase tracking-wider">
                        <Activity className="h-4 w-4" />
                        Analisi sessione
                      </div>
                      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                        {formatDate(activeEntry.activity_date) && (
                          <span>📅 {formatDate(activeEntry.activity_date)}</span>
                        )}
                        {formatDistance(activeEntry.activity_distance_meters) && (
                          <span>🏊 {formatDistance(activeEntry.activity_distance_meters)}</span>
                        )}
                        {formatTime(activeEntry.activity_duration_seconds) && (
                          <span>⏱ {formatTime(activeEntry.activity_duration_seconds)}</span>
                        )}
                      </div>
                    </div>
                    <h2 className="text-lg font-semibold text-foreground mb-2">{activeEntry.title}</h2>
                    <p className="text-muted-foreground text-sm leading-relaxed mb-3">{activeEntry.summary}</p>
                    {activeBullets.length > 0 && (
                      <ul className="space-y-2 text-sm text-foreground/80 mb-3">
                        {activeBullets.map((bullet: string, bulletIdx: number) => (
                          <li key={bulletIdx} className="flex items-start gap-2">
                            <span className="text-primary">•</span>
                            <span>{bullet}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {activeTags.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {activeTags.map((tag: string, tagIdx: number) => (
                          <Badge key={tagIdx} variant="outline" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </motion.div>
              )}

              {sessionEntries.length >= limit && (
                <div className="flex justify-center pt-4">
                  <Button
                    variant="outline-neon"
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Carica altre
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
