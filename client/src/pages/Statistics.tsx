import { useState } from "react";
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
import { TrendingUp, TrendingDown, Minus, ChevronLeft } from "lucide-react";
import { Link } from "wouter";

const PERIOD_OPTIONS = [
  { value: 7, label: "7 giorni" },
  { value: 30, label: "30 giorni" },
  { value: 90, label: "90 giorni" },
  { value: 365, label: "1 anno" },
];

const HR_ZONE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#dc2626"];
const PACE_COLORS = ["#06b6d4", "#0ea5e9", "#3b82f6", "#6366f1", "#8b5cf6"];

export default function Statistics() {
  const [period, setPeriod] = useState(30);

  const { data: timeline, isLoading: timelineLoading } = trpc.statistics.getTimeline.useQuery({ days: period });
  const { data: performance, isLoading: performanceLoading } = trpc.statistics.getPerformance.useQuery({ days: period });
  const { data: advanced, isLoading: advancedLoading } = trpc.statistics.getAdvanced.useQuery({ days: period });

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

  return (
    <div className="min-h-screen bg-[oklch(0.15_0.02_250)] text-white pb-20">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[oklch(0.18_0.03_250)] border-b border-[oklch(0.25_0.03_250)] px-4 py-4">
        <div className="flex items-center gap-3">
          <Link href="/dashboard">
            <button className="p-2 hover:bg-white/10 rounded-lg transition-colors">
              <ChevronLeft className="w-5 h-5" />
            </button>
          </Link>
          <h1 className="text-xl font-bold">📊 Statistiche</h1>
        </div>

        {/* Period Filter */}
        <div className="flex gap-2 mt-4 overflow-x-auto">
          {PERIOD_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => setPeriod(option.value)}
              className={`px-4 py-2 rounded-lg whitespace-nowrap transition-colors ${
                period === option.value
                  ? "bg-[oklch(0.55_0.20_220)] text-white"
                  : "bg-[oklch(0.20_0.03_250)] text-[oklch(0.70_0.05_250)] hover:bg-[oklch(0.25_0.03_250)]"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 space-y-6">
        {isLoading ? (
          <>
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-48 w-full" />
          </>
        ) : (
          <>
            {/* Progress Timeline */}
            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-[oklch(0.85_0.05_220)]">
                ━━━ PROGRESS TIMELINE ━━━
              </h2>
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
            </section>

            {/* Analisi Prestazioni */}
            <section className="space-y-3">
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
                  <h3 className="font-semibold mb-3">Zone Frequenza Cardiaca</h3>
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
                  <h3 className="font-semibold mb-3">Distribuzione Pace</h3>
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
            </section>

            {/* Analisi Avanzate */}
            {advanced && (
              <section className="space-y-3">
                <h2 className="text-lg font-semibold text-[oklch(0.85_0.05_220)]">
                  ━━━ ANALISI AVANZATE ━━━
                </h2>

                {/* Scores */}
                <div className="grid grid-cols-3 gap-3">
                  <div
                    className="rounded-xl p-4 text-center"
                    style={{
                      background: "oklch(0.18 0.03 250)",
                      border: "1px solid oklch(0.25 0.03 250)",
                    }}
                  >
                    <div className="text-sm text-[oklch(0.70_0.05_250)]">Performance</div>
                    <div className="text-3xl font-bold text-[oklch(0.90_0.05_220)]">
                      {advanced.performanceIndex}
                    </div>
                    <div className="text-xs text-[oklch(0.60_0.05_250)]">/100</div>
                  </div>
                  <div
                    className="rounded-xl p-4 text-center"
                    style={{
                      background: "oklch(0.18 0.03 250)",
                      border: "1px solid oklch(0.25 0.03 250)",
                    }}
                  >
                    <div className="text-sm text-[oklch(0.70_0.05_250)]">Consistency</div>
                    <div className="text-3xl font-bold text-[oklch(0.90_0.05_220)]">
                      {advanced.consistencyScore}
                    </div>
                    <div className="text-xs text-[oklch(0.60_0.05_250)]">/100</div>
                  </div>
                  <div
                    className="rounded-xl p-4 text-center"
                    style={{
                      background: "oklch(0.18 0.03 250)",
                      border: "1px solid oklch(0.25 0.03 250)",
                    }}
                  >
                    <div className="text-sm text-[oklch(0.70_0.05_250)]">Trend</div>
                    <div className="flex items-center justify-center gap-1 text-2xl font-bold">
                      {advanced.trendIndicator.direction === "up" && (
                        <TrendingUp className="w-6 h-6 text-green-500" />
                      )}
                      {advanced.trendIndicator.direction === "down" && (
                        <TrendingDown className="w-6 h-6 text-red-500" />
                      )}
                      {advanced.trendIndicator.direction === "stable" && (
                        <Minus className="w-6 h-6 text-yellow-500" />
                      )}
                      <span className="text-[oklch(0.90_0.05_220)]">
                        {advanced.trendIndicator.percentage}%
                      </span>
                    </div>
                  </div>
                </div>

                {/* Streak */}
                <div
                  className="rounded-xl p-4"
                  style={{
                    background: "oklch(0.18 0.03 250)",
                    border: "1px solid oklch(0.25 0.03 250)",
                  }}
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="text-sm text-[oklch(0.70_0.05_250)]">Streak Attuale</div>
                      <div className="text-2xl font-bold text-[oklch(0.90_0.05_220)]">
                        🔥 {advanced.streak.current} giorni
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-[oklch(0.70_0.05_250)]">Record</div>
                      <div className="text-2xl font-bold text-[oklch(0.90_0.05_220)]">
                        {advanced.streak.record} giorni
                      </div>
                    </div>
                  </div>
                </div>

                {/* Insights */}
                {advanced.insights.length > 0 && (
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
                        className="text-sm text-[oklch(0.80_0.05_220)] bg-[oklch(0.20_0.03_250)] rounded-lg p-3"
                      >
                        {insight}
                      </div>
                    ))}
                  </div>
                )}

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
              </section>
            )}
          </>
        )}
      </div>

      <MobileNav />
    </div>
  );
}
