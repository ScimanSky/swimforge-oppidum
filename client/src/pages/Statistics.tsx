import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import MobileNav from "@/components/MobileNav";
import { Skeleton } from "@/components/ui/skeleton";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { TrendingUp, TrendingDown, Minus, ChevronLeft, Info } from "lucide-react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { metricsDefinitions } from "@/data/metricsDefinitions";
import { AppLayout } from "@/components/AppLayout";

const PERIOD_OPTIONS = [
  { value: 7, label: "7 giorni" },
  { value: 30, label: "30 giorni" },
  { value: 90, label: "90 giorni" },
  { value: 365, label: "1 anno" },
];

const HR_ZONE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#dc2626"];
const PACE_COLORS = ["#06b6d4", "#0ea5e9", "#3b82f6", "#6366f1", "#8b5cf6"];

function MetricInfoButton({ info }: { info: any }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="p-1 rounded-md hover:bg-[oklch(0.25_0.03_250)] transition-colors"
        title="Info"
      >
        <Info className="w-4 h-4 text-[oklch(0.60_0.05_250)]" />
      </button>
      {open && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            style={{
              background: "oklch(0.15 0.03 250)",
              border: "1px solid oklch(0.25 0.03 250)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="sticky top-0 border-b p-6"
              style={{
                background: "oklch(0.15 0.03 250)",
                borderColor: "oklch(0.25 0.03 250)",
              }}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-[oklch(0.90_0.05_220)]">
                  {info.title}
                </h2>
                <button
                  onClick={() => setOpen(false)}
                  className="text-[oklch(0.60_0.05_250)] hover:text-[oklch(0.80_0.05_220)]"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="p-6 space-y-4 text-sm text-[oklch(0.80_0.05_220)]">
              <p>{info.description}</p>
              <div className="rounded-lg p-3 bg-[oklch(0.18_0.03_250)] border border-[oklch(0.25_0.03_250)] text-xs whitespace-pre-line">
                {info.formula}
              </div>
              <div>
                <h3 className="font-semibold text-[oklch(0.90_0.05_220)] mb-2">Interpretazione</h3>
                <ul className="space-y-1">
                  <li><strong>Ottimo:</strong> {info.interpretation.excellent}</li>
                  <li><strong>Buono:</strong> {info.interpretation.good}</li>
                  <li><strong>Discreto:</strong> {info.interpretation.fair}</li>
                  <li><strong>Scarso:</strong> {info.interpretation.poor}</li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold text-[oklch(0.90_0.05_220)] mb-2">Come migliorare</h3>
                <ul className="list-disc pl-5 space-y-1">
                  {info.howToImprove.map((tip: string, idx: number) => (
                    <li key={idx}>{tip}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function RingMetric({
  label,
  value,
  max = 100,
  color,
  info,
}: {
  label: string;
  value: number | null;
  max?: number;
  color: string;
  info: any;
}) {
  const safeValue = value ?? null;
  const pct = safeValue !== null ? Math.max(0, Math.min(100, (safeValue / max) * 100)) : 0;
  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct / 100);

  return (
    <div className="rounded-2xl p-3 bg-[oklch(0.18_0.03_250)] border border-[oklch(0.25_0.03_250)]">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs uppercase tracking-wide text-[oklch(0.65_0.05_250)]">{label}</div>
        <MetricInfoButton info={info} />
      </div>
      <div className="flex items-center gap-4">
        <div className="relative w-20 h-20">
          <svg viewBox="0 0 100 100" className="w-full h-full">
            <circle
              cx="50"
              cy="50"
              r={radius}
              stroke="oklch(0.28 0.03 250)"
              strokeWidth="7"
              fill="none"
            />
            <circle
              cx="50"
              cy="50"
              r={radius}
              stroke={color}
              strokeWidth="7"
              fill="none"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              strokeLinecap="round"
              transform="rotate(-90 50 50)"
              style={{ filter: `drop-shadow(0 0 10px ${color}55)` }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-xl font-bold text-[oklch(0.92_0.05_220)]">
              {safeValue !== null ? Math.round(safeValue) : "N/D"}
            </div>
            <div className="text-[10px] text-[oklch(0.60_0.05_250)]">/{max}</div>
          </div>
        </div>
        <div className="text-xs text-[oklch(0.65_0.05_250)] leading-snug">
          {safeValue !== null ? `${Math.round(pct)}%` : "Dato non disponibile"}
        </div>
      </div>
    </div>
  );
}

function GaugeMetric({
  label,
  value,
  min = -100,
  max = 100,
  info,
}: {
  label: string;
  value: number | null;
  min?: number;
  max?: number;
  info: any;
}) {
  const safeValue = value ?? null;
  const clamped = safeValue !== null ? Math.max(min, Math.min(max, safeValue)) : null;
  const pct = clamped !== null ? ((clamped - min) / (max - min)) * 100 : 0;
  const color =
    clamped === null
      ? "oklch(0.60_0.05_250)"
      : clamped > 20
      ? "#22c55e"
      : clamped > 0
      ? "#f59e0b"
      : "#ef4444";

  return (
    <div className="rounded-2xl p-4 bg-[oklch(0.18_0.03_250)] border border-[oklch(0.25_0.03_250)]">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs uppercase tracking-wide text-[oklch(0.65_0.05_250)]">{label}</div>
        <MetricInfoButton info={info} />
      </div>
      <div className="relative">
        <svg viewBox="0 0 200 120" className="w-full h-28">
          <path
            d="M10 110 A90 90 0 0 1 190 110"
            fill="none"
            stroke="oklch(0.28 0.03 250)"
            strokeWidth="12"
            pathLength={100}
            strokeLinecap="round"
          />
          <path
            d="M10 110 A90 90 0 0 1 190 110"
            fill="none"
            stroke={color}
            strokeWidth="12"
            pathLength={100}
            strokeDasharray={100}
            strokeDashoffset={100 - pct}
            strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 12px ${color}66)` }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pt-6">
          <div className="text-2xl font-bold text-[oklch(0.92_0.05_220)]">
            {safeValue !== null ? `${Math.round(safeValue)}%` : "N/D"}
          </div>
          <div className="text-[10px] text-[oklch(0.60_0.05_250)]">
            {min}% — {max}%
          </div>
        </div>
      </div>
    </div>
  );
}

function StreakRing({
  current,
  record,
}: {
  current: number;
  record: number;
}) {
  const max = Math.max(record || 0, 7);
  return (
    <div className="rounded-2xl p-3 bg-[oklch(0.18_0.03_250)] border border-[oklch(0.25_0.03_250)]">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs uppercase tracking-wide text-[oklch(0.65_0.05_250)]">Streak</div>
        <div className="text-[10px] text-[oklch(0.60_0.05_250)]">Record {record}g</div>
      </div>
      <div className="flex items-center gap-4">
        <div className="relative w-20 h-20">
          <svg viewBox="0 0 100 100" className="w-full h-full">
            <circle
              cx="50"
              cy="50"
              r={32}
              stroke="oklch(0.28 0.03 250)"
              strokeWidth="7"
              fill="none"
            />
            <circle
              cx="50"
              cy="50"
              r={32}
              stroke="#f97316"
              strokeWidth="7"
              fill="none"
              strokeDasharray={2 * Math.PI * 32}
              strokeDashoffset={(2 * Math.PI * 32) * (1 - Math.min(1, current / max))}
              strokeLinecap="round"
              transform="rotate(-90 50 50)"
              style={{ filter: "drop-shadow(0 0 10px #f9731655)" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-lg font-bold text-[oklch(0.92_0.05_220)]">{current}</div>
            <div className="text-[10px] text-[oklch(0.60_0.05_250)]">giorni</div>
          </div>
        </div>
        <div className="text-xs text-[oklch(0.60_0.05_250)] leading-snug">
          🔥 Consecutivi attuali
        </div>
      </div>
    </div>
  );
}

export default function Statistics() {
  const [period, setPeriod] = useState(30);
  const aiLayout = useMemo(() => {
    if (typeof window === "undefined") return "current";
    const param = new URLSearchParams(window.location.search).get("aiLayout");
    return param || "current";
  }, []);

  const { data: timeline, isLoading: timelineLoading } = trpc.statistics.getTimeline.useQuery(
    { days: period },
    { staleTime: 5 * 60 * 1000 } // Cache for 5 minutes
  );
  const { data: performance, isLoading: performanceLoading } = trpc.statistics.getPerformance.useQuery(
    { days: period },
    { staleTime: 5 * 60 * 1000 } // Cache for 5 minutes
  );
  const { data: advanced, isLoading: advancedLoading } = trpc.statistics.getAdvanced.useQuery(
    { days: period },
    { 
      staleTime: 24 * 60 * 60 * 1000, // Cache for 24 hours (AI insights)
      cacheTime: 24 * 60 * 60 * 1000  // Keep in cache for 24 hours
    }
  );

  const isLoading = timelineLoading || performanceLoading || advancedLoading;

  // Prepare HR Zones data for pie chart
  const hrZonesData = performance
    ? [
        { name: "Z1 Recupero", value: performance.hrZones.zone1, color: HR_ZONE_COLORS[0] },
        { name: "Z2 Aerobica", value: performance.hrZones.zone2, color: HR_ZONE_COLORS[1] },
        { name: "Z3 Soglia", value: performance.hrZones.zone3, color: HR_ZONE_COLORS[2] },
        { name: "Z4 Anaerobica", value: performance.hrZones.zone4, color: HR_ZONE_COLORS[3] },
        { name: "Z5 Massima", value: performance.hrZones.zone5, color: HR_ZONE_COLORS[4] },
      ].filter((zone) => zone.value > 0)
    : [];

  // Format timeline data for chart
  const timelineChartData = timeline?.map((point) => ({
    date: new Date(point.date).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" }),
    distanza: point.distance,
    pace: point.pace ? point.pace / 60 : null, // convert to minutes
    sessioni: point.sessions,
  }));

  const renderInsights = () => {
    if (!advanced || advanced.insights.length === 0) return null;

    if (aiLayout === "hero") {
      const [primary, ...rest] = advanced.insights;
      const secondary = rest.slice(0, 3);
      return (
        <div className="rounded-2xl p-5 bg-[oklch(0.16_0.04_240)] border border-[oklch(0.30_0.05_230)] shadow-[0_0_40px_rgba(30,120,255,0.15)]">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="px-2 py-1 text-[10px] rounded-full bg-[oklch(0.25_0.12_230)] text-[oklch(0.90_0.05_220)]">AI Coach</span>
              <h3 className="font-semibold text-[oklch(0.95_0.02_220)]">Insights in evidenza</h3>
            </div>
            <span className="text-[10px] text-[oklch(0.60_0.05_250)]">Aggiornati oggi</span>
          </div>
          <div className="text-[oklch(0.92_0.03_220)] text-base leading-relaxed">
            {primary}
          </div>
          {secondary.length > 0 && (
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {secondary.map((insight, idx) => (
                <div
                  key={idx}
                  className="rounded-xl p-3 text-sm text-[oklch(0.85_0.05_220)] bg-[oklch(0.20_0.03_250_/_0.6)] border border-[oklch(0.28_0.03_250)]"
                >
                  {insight}
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    if (aiLayout === "sidebar") {
      return (
        <div className="rounded-2xl p-4 bg-[oklch(0.18_0.03_250)] border border-[oklch(0.25_0.03_250)]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-[oklch(0.92_0.03_220)]">AI Insights</h3>
            <span className="text-[10px] px-2 py-1 rounded-full bg-[oklch(0.25_0.12_230)] text-[oklch(0.90_0.05_220)]">Focus</span>
          </div>
          <div className="grid gap-3 md:grid-cols-[1.2fr_0.8fr]">
            <div className="text-sm text-[oklch(0.85_0.05_220)] leading-relaxed">
              {advanced.insights[0]}
            </div>
            <div className="flex flex-col gap-2">
              {advanced.insights.slice(1, 5).map((insight, idx) => (
                <div
                  key={idx}
                  className="rounded-lg px-3 py-2 text-xs text-[oklch(0.80_0.05_220)] bg-[oklch(0.20_0.03_250_/_0.55)] border border-[oklch(0.28_0.03_250)]"
                >
                  {insight}
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    if (aiLayout === "timeline") {
      return (
        <div className="rounded-2xl p-4 bg-[oklch(0.18_0.03_250)] border border-[oklch(0.25_0.03_250)]">
          <h3 className="font-semibold text-[oklch(0.92_0.03_220)] mb-4">AI Insights</h3>
          <div className="relative pl-5 space-y-4">
            <div className="absolute left-2 top-1 bottom-1 w-px bg-[oklch(0.30_0.03_250)]" />
            {advanced.insights.map((insight, idx) => (
              <div key={idx} className="relative">
                <div className="absolute -left-1.5 top-1.5 w-2.5 h-2.5 rounded-full bg-[oklch(0.60_0.18_220)]" />
                <div className="text-sm text-[oklch(0.85_0.05_220)] bg-[oklch(0.20_0.03_250_/_0.55)] border border-[oklch(0.28_0.03_250)] rounded-lg p-3">
                  {insight}
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    // current layout (default)
    return (
      <div
        className="rounded-xl p-4 space-y-2"
        style={{
          background: "oklch(0.18 0.03 250)",
          border: "1px solid oklch(0.25 0.03 250)",
        }}
      >
        <h3 className="font-semibold">💡 Insights Intelligenti</h3>
        {advanced.insights.map((insight, index) => (
          <div
            key={index}
            className="text-sm text-[oklch(0.80_0.05_220)] bg-[oklch(0.20_0.03_250_/_0.55)] rounded-lg p-3"
          >
            {insight}
          </div>
        ))}
      </div>
    );
  };

  return (
    <AppLayout showBubbles={true} bubbleIntensity="low" className="text-white">
    <div className="pb-20 overflow-x-hidden">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[oklch(0.18_0.03_250_/_0.55)] border-b border-[oklch(0.25_0.03_250)] px-4 py-4">
        <div className="flex items-center gap-3">
          <Link href="/dashboard">
            <button className="p-2 hover:bg-white/10 rounded-lg transition-colors">
              <ChevronLeft className="w-5 h-5" />
            </button>
          </Link>
          <h1 className="text-xl font-bold">📊 Statistiche</h1>
        </div>

        {/* Period Filter */}
        <div className="flex gap-2 mt-4 overflow-x-auto scrollbar-hide pb-2">
          {PERIOD_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => setPeriod(option.value)}
              className={`px-4 py-2 rounded-lg whitespace-nowrap transition-colors ${
                period === option.value
                  ? "bg-[oklch(0.55_0.20_220)] text-white"
                  : "bg-[oklch(0.20_0.03_250_/_0.55)] text-[oklch(0.70_0.05_250)] hover:bg-[oklch(0.25_0.03_250)]"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 space-y-6 max-w-full overflow-x-hidden">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <div className="relative w-16 h-16">
              <div className="absolute inset-0 border-4 border-[oklch(0.30_0.04_250)] rounded-full"></div>
              <div className="absolute inset-0 border-4 border-[oklch(0.70_0.18_220)] border-t-transparent rounded-full animate-spin"></div>
            </div>
            <div className="text-center space-y-2">
              <p className="text-lg font-semibold text-[oklch(0.85_0.05_220)]">Caricamento statistiche...</p>
              <p className="text-sm text-[oklch(0.65_0.03_220)]">Analisi dati in corso</p>
            </div>
          </div>
        ) : (
          <>
            {/* Progress Timeline */}
            <motion.section 
              className="space-y-3"
              initial={{ opacity: 0, y: 30, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
            >
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-[oklch(0.85_0.05_220)]">
                  ━━━ PROGRESS TIMELINE ━━━
                </h2>
                <div className="group relative">
                  <Info className="w-4 h-4 text-[oklch(0.60_0.05_250)] cursor-help" />
                  <div className="absolute left-0 top-6 w-64 p-2 bg-[oklch(0.20_0.03_250_/_0.55)] border border-[oklch(0.30_0.03_250)] rounded-lg text-xs text-[oklch(0.85_0.05_220)] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                    Visualizza l'andamento della distanza percorsa e del pace medio nel periodo selezionato. Utile per identificare trend e progressi nel tempo.
                  </div>
                </div>
              </div>
              <div
                className="rounded-xl p-4"
                style={{
                  background: "oklch(0.18 0.03 250)",
                  border: "1px solid oklch(0.25 0.03 250)",
                }}
              >
                {timelineChartData && timelineChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={timelineChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.25 0.03 250)" />
                      <XAxis dataKey="date" stroke="oklch(0.60 0.05 250)" style={{ fontSize: "12px" }} />
                      <YAxis stroke="oklch(0.60 0.05 250)" style={{ fontSize: "12px" }} />
                      <Tooltip
                        contentStyle={{
                          background: "oklch(0.20 0.03 250)",
                          border: "1px solid oklch(0.30 0.03 250)",
                          borderRadius: "8px",
                          color: "white",
                        }}
                      />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="distanza"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        name="Distanza (km)"
                        dot={{ fill: "#3b82f6" }}
                      />
                      <Line
                        type="monotone"
                        dataKey="pace"
                        stroke="#10b981"
                        strokeWidth={2}
                        name="Pace (min/100m)"
                        dot={{ fill: "#10b981" }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-center text-[oklch(0.60_0.05_250)] py-8">
                    Nessun dato disponibile per questo periodo
                  </p>
                )}
              </div>
            </motion.section>

            {/* Analisi Prestazioni */}
            <motion.section 
              className="space-y-3"
              initial={{ opacity: 0, y: 30, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            >
              <h2 className="text-lg font-semibold text-[oklch(0.85_0.05_220)]">
                ━━━ ANALISI PRESTAZIONI ━━━
              </h2>

              {/* HR Zones */}
              {hrZonesData.length > 0 && (
                <div
                  className="rounded-xl p-4"
                  style={{
                    background: "oklch(0.18 0.03 250)",
                    border: "1px solid oklch(0.25 0.03 250)",
                  }}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <h3 className="font-semibold">Zone Frequenza Cardiaca</h3>
                    <div className="group relative">
                      <Info className="w-4 h-4 text-[oklch(0.60_0.05_250)] cursor-help" />
                      <div className="absolute left-0 top-6 w-72 p-2 bg-[oklch(0.20_0.03_250_/_0.55)] border border-[oklch(0.30_0.03_250)] rounded-lg text-xs text-[oklch(0.85_0.05_220)] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                        Mostra la distribuzione percentuale del tempo trascorso in ciascuna zona di frequenza cardiaca. Z1: Recupero, Z2: Aerobica, Z3: Soglia, Z4: Anaerobica, Z5: Massima.
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col md:flex-row items-center gap-4">
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie
                          data={hrZonesData}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={80}
                          paddingAngle={2}
                          dataKey="value"
                        >
                          {hrZonesData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            background: "oklch(0.20 0.03 250)",
                            border: "1px solid oklch(0.30 0.03 250)",
                            borderRadius: "8px",
                            color: "white",
                          }}
                          labelStyle={{
                            color: "white",
                          }}
                          itemStyle={{
                            color: "white",
                          }}
                          formatter={(value: number) => `${value}%`}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-2 text-sm">
                      {hrZonesData.map((zone) => (
                        <div key={zone.name} className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ background: zone.color }}
                          />
                          <span>
                            {zone.name}: {zone.value}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Pace Distribution */}
              {performance && performance.paceDistribution.length > 0 && (
                <div
                  className="rounded-xl p-4"
                  style={{
                    background: "oklch(0.18 0.03 250)",
                    border: "1px solid oklch(0.25 0.03 250)",
                  }}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <h3 className="font-semibold">Distribuzione Pace</h3>
                    <div className="group relative">
                      <Info className="w-4 h-4 text-[oklch(0.60_0.05_250)] cursor-help" />
                      <div className="absolute left-0 top-6 w-72 p-2 bg-[oklch(0.20_0.03_250_/_0.55)] border border-[oklch(0.30_0.03_250)] rounded-lg text-xs text-[oklch(0.85_0.05_220)] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                        Mostra quante sessioni hai completato in ciascun range di pace (min/100m). Ti aiuta a capire a quale velocità nuoti più frequentemente.
                      </div>
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={performance.paceDistribution}>
                      <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.25 0.03 250)" />
                      <XAxis dataKey="range" stroke="oklch(0.60 0.05 250)" style={{ fontSize: "12px" }} />
                      <YAxis stroke="oklch(0.60 0.05 250)" style={{ fontSize: "12px" }} />
                      <Tooltip
                        contentStyle={{
                          background: "oklch(0.20 0.03 250)",
                          border: "1px solid oklch(0.30 0.03 250)",
                          borderRadius: "8px",
                          color: "white",
                        }}
                      />
                      <Bar dataKey="count" fill="#06b6d4" name="Sessioni" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Calories & SWOLF */}
              {performance && (
                <div className="grid grid-cols-2 gap-3">
                  <div
                    className="rounded-xl p-4"
                    style={{
                      background: "oklch(0.18 0.03 250)",
                      border: "1px solid oklch(0.25 0.03 250)",
                    }}
                  >
                    <div className="text-sm text-[oklch(0.70_0.05_250)]">Calorie Totali</div>
                    <div className="text-2xl font-bold text-[oklch(0.90_0.05_220)]">
                      {performance.caloriesTotal.toLocaleString()}
                    </div>
                    <div className="text-xs text-[oklch(0.60_0.05_250)] mt-1">
                      Media: {performance.avgCaloriesPerSession}/sessione
                    </div>
                  </div>
                  {performance.swolfAvg && (
                    <div
                      className="rounded-xl p-4"
                      style={{
                        background: "oklch(0.18 0.03 250)",
                        border: "1px solid oklch(0.25 0.03 250)",
                      }}
                    >
                      <div className="text-sm text-[oklch(0.70_0.05_250)]">SWOLF Medio</div>
                      <div className="text-2xl font-bold text-[oklch(0.90_0.05_220)]">
                        {performance.swolfAvg}
                      </div>
                      <div className="text-xs text-[oklch(0.60_0.05_250)] mt-1">
                        Efficienza nuotata
                      </div>
                    </div>
                  )}
                </div>
              )}
              </motion.section>

            {/* Analisi Avanzate */}
            {advanced && (
              <motion.section 
                className="space-y-3"
                initial={{ opacity: 0, y: 30, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: 0.3, type: "spring", stiffness: 200 }}
              >
                <h2 className="text-lg font-semibold text-[oklch(0.85_0.05_220)]">
                  ━━━ ANALISI AVANZATE ━━━
                </h2>

                {/* Core Rings */}
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <RingMetric
                    label="Performance"
                    value={advanced.performanceIndex}
                    color="#38bdf8"
                    info={metricsDefinitions.performanceIndex}
                  />
                  <RingMetric
                    label="Consistency"
                    value={advanced.consistencyScore}
                    color="#22c55e"
                    info={metricsDefinitions.consistencyScore}
                  />
                  <RingMetric
                    label="Recovery"
                    value={advanced.recoveryReadinessScore}
                    color="#06b6d4"
                    info={metricsDefinitions.rrs}
                  />
                  <StreakRing current={advanced.streak.current} record={advanced.streak.record} />
                </div>

                {/* Advanced Swimming Metrics */}
                <div className="space-y-3">
                  <h3 className="text-md font-semibold text-[oklch(0.80_0.05_220)]">
                    🏊 Metriche Avanzate
                  </h3>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    <RingMetric
                      label="SEI"
                      value={advanced.swimmingEfficiencyIndex}
                      color="#a855f7"
                      info={metricsDefinitions.sei}
                    />
                    <RingMetric
                      label="TCI"
                      value={advanced.technicalConsistencyIndex}
                      color="#f59e0b"
                      info={metricsDefinitions.tci}
                    />
                    <RingMetric
                      label="SER"
                      value={advanced.strokeEfficiencyRating}
                      color="#f97316"
                      info={metricsDefinitions.ser}
                    />
                    <RingMetric
                      label="ACS"
                      value={advanced.aerobicCapacityScore}
                      color="#84cc16"
                      info={metricsDefinitions.acs}
                    />
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <GaugeMetric
                      label="Progressive Overload"
                      value={advanced.progressiveOverloadIndex}
                      info={metricsDefinitions.poi}
                    />
                    <GaugeMetric
                      label="Trend"
                      value={advanced.trendIndicator.percentage}
                      min={-50}
                      max={50}
                      info={metricsDefinitions.performanceIndex}
                    />
                  </div>
                </div>

                {/* Insights */}
                {renderInsights()}

                {/* Predictions */}
                {advanced.predictions && (
                  <div
                    className="rounded-xl p-4"
                    style={{
                      background: "oklch(0.18 0.03 250)",
                      border: "1px solid oklch(0.25 0.03 250)",
                    }}
                  >
                    <h3 className="font-semibold mb-2">📈 Previsioni</h3>
                    <p className="text-sm text-[oklch(0.80_0.05_220)]">
                      Al ritmo attuale raggiungerai{" "}
                      <span className="font-bold text-[oklch(0.90_0.05_220)]">
                        {advanced.predictions.targetKm}km
                      </span>{" "}
                      entro il{" "}
                      <span className="font-bold text-[oklch(0.90_0.05_220)]">
                        {new Date(advanced.predictions.estimatedDate).toLocaleDateString("it-IT")}
                      </span>
                    </p>
                    <p className="text-xs text-[oklch(0.60_0.05_250)] mt-1">
                      ({advanced.predictions.daysRemaining} giorni rimasti)
                    </p>
                  </div>
                )}
              </motion.section>
            )}
          </>
        )}
      </div>

      <MobileNav />
    </div>
    </AppLayout>
  );
}
