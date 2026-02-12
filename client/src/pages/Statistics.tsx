import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
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
import { Info } from "lucide-react";
import { motion } from "framer-motion";
import { metricsDefinitions } from "@/data/metricsDefinitions";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Link } from "wouter";

const PERIOD_OPTIONS = [
  { value: 7, label: "7 giorni" },
  { value: 30, label: "30 giorni" },
  { value: 90, label: "90 giorni" },
  { value: 365, label: "1 anno" },
];

const HR_ZONE_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

function MetricInfoButton({ info }: { info: any }) {
  const [open, setOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open && contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="p-1 rounded-md hover:bg-muted/60 transition-colors"
        title="Info"
      >
        <Info className="w-4 h-4 text-muted-foreground" />
      </button>
      {open && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto bg-card border border-border"
            ref={contentRef}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="sticky top-0 border-b border-border p-6 bg-card"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-foreground">
                  {info.title}
                </h2>
                <button
                  onClick={() => setOpen(false)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="p-6 space-y-4 text-sm text-muted-foreground">
              <p>{info.description}</p>
              <div className="rounded-lg p-3 bg-secondary border border-border text-xs whitespace-pre-line text-foreground">
                {info.formula}
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-2">Interpretazione</h3>
                <ul className="space-y-1">
                  <li><strong>Ottimo:</strong> {info.interpretation.excellent}</li>
                  <li><strong>Buono:</strong> {info.interpretation.good}</li>
                  <li><strong>Discreto:</strong> {info.interpretation.fair}</li>
                  <li><strong>Scarso:</strong> {info.interpretation.poor}</li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-2">Come migliorare</h3>
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
  const hasValue = safeValue !== null && Number.isFinite(safeValue);
  const pct = hasValue ? Math.max(0, Math.min(100, (safeValue / max) * 100)) : 0;
  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct / 100);

  return (
    <div className="rounded-2xl p-4 bg-card/80 border border-border/60 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <MetricInfoButton info={info} />
      </div>
      <div className="flex items-center gap-4">
        <div className="relative w-20 h-20">
          <svg viewBox="0 0 100 100" className="w-full h-full">
            <circle
              cx="50"
              cy="50"
              r={radius}
              stroke="var(--border)"
              strokeWidth="7"
              fill="none"
            />
            {hasValue && (
              <motion.circle
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
                initial={{ strokeDashoffset: circumference }}
                animate={{ strokeDashoffset: offset }}
                transition={{ duration: 0.8, ease: [0.2, 0.9, 0.2, 1] }}
                style={{ filter: `drop-shadow(0 0 10px ${color})` }}
              />
            )}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-xl font-bold text-foreground">
            {hasValue ? Math.round(safeValue) : "N/D"}
            </div>
            <div className="text-[10px] text-muted-foreground">/{max}</div>
          </div>
        </div>
        <div className="text-xs text-muted-foreground leading-snug">
          {hasValue ? `${Math.round(pct)}%` : "Dato non disponibile"}
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
  neutralRange = 0,
  info,
}: {
  label: string;
  value: number | null;
  min?: number;
  max?: number;
  neutralRange?: number;
  info: any;
}) {
  const safeValue = value ?? null;
  const hasValue = safeValue !== null && Number.isFinite(safeValue);
  const rounded = hasValue ? Math.round(safeValue) : null;
  const clamped = rounded !== null ? Math.max(min, Math.min(max, rounded)) : null;
  const isNeutral =
    clamped !== null &&
    (Math.abs(clamped) <= neutralRange || Math.round(clamped) === 0);
  const pct = clamped !== null && !isNeutral ? ((clamped - min) / (max - min)) * 100 : 0;
  const color =
    clamped === null || isNeutral
      ? "var(--muted-foreground)"
      : clamped > 20
      ? "var(--chart-2)"
      : clamped > 0
      ? "var(--chart-4)"
      : "var(--destructive)";

  return (
    <div className="rounded-2xl p-4 bg-card/80 border border-border/60 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <MetricInfoButton info={info} />
      </div>
      <div className="relative">
        <svg viewBox="0 0 200 120" className="w-full h-28">
          <path
            d="M10 110 A90 90 0 0 1 190 110"
            fill="none"
            stroke="var(--border)"
            strokeWidth="12"
            pathLength={100}
            strokeLinecap="round"
          />
          {clamped !== null && !isNeutral ? (
            <path
              d="M10 110 A90 90 0 0 1 190 110"
              fill="none"
              stroke={color}
              strokeWidth="12"
              pathLength={100}
              strokeDasharray={100}
              strokeDashoffset={100 - pct}
              strokeLinecap="round"
              style={{ filter: `drop-shadow(0 0 12px ${color})` }}
            />
          ) : null}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pt-6">
          <div className="text-2xl font-bold text-foreground">
            {rounded !== null ? `${rounded}%` : "N/D"}
          </div>
          <div className="text-[10px] text-muted-foreground">
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
    <div className="rounded-2xl p-4 bg-card/80 border border-border/60 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">Streak</div>
        <div className="text-[10px] text-muted-foreground">Record {record}g</div>
      </div>
      <div className="flex items-center gap-4">
        <div className="relative w-20 h-20">
          <svg viewBox="0 0 100 100" className="w-full h-full">
            <circle
              cx="50"
              cy="50"
              r={32}
              stroke="var(--border)"
              strokeWidth="7"
              fill="none"
            />
            <circle
              cx="50"
              cy="50"
              r={32}
              stroke="var(--chart-5)"
              strokeWidth="7"
              fill="none"
              strokeDasharray={2 * Math.PI * 32}
              strokeDashoffset={(2 * Math.PI * 32) * (1 - Math.min(1, current / max))}
              strokeLinecap="round"
              transform="rotate(-90 50 50)"
              style={{ filter: "drop-shadow(0 0 10px var(--chart-5))" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-lg font-bold text-foreground">{current}</div>
            <div className="text-[10px] text-muted-foreground">giorni</div>
          </div>
        </div>
        <div className="text-xs text-muted-foreground leading-snug">
          🔥 Consecutivi attuali
        </div>
      </div>
    </div>
  );
}

export default function Statistics() {
  const [period, setPeriod] = useState(30);

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

  const progressiveOverloadValue =
    advanced?.poiBaseline === false ? null : advanced?.progressiveOverloadIndex ?? null;

  const trendValue =
    advanced?.trendBaseline && advanced?.trendIndicator
      ? advanced.trendIndicator.direction === "down"
        ? -advanced.trendIndicator.percentage
        : advanced.trendIndicator.percentage
      : null;


  return (
    <AppLayout className="text-foreground">
      <div className="space-y-6 lg:space-y-3 pb-12 lg:pb-2">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Progressi</p>
            <h1 className="text-3xl font-semibold text-foreground">Statistiche</h1>
            <p className="text-sm text-muted-foreground">
              Metriche avanzate e trend sulle tue sessioni recenti.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="neon" asChild>
                <Link href="/statistics">Statistiche</Link>
              </Button>
              <Button size="sm" variant="outline-neon" asChild>
                <Link href="/goals">Obiettivi</Link>
              </Button>
              <Button size="sm" variant="outline-neon" asChild>
                <Link href="/badges">Badge</Link>
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {PERIOD_OPTIONS.map((option) => (
              <Button
                key={option.value}
                size="sm"
                variant={period === option.value ? "default" : "secondary"}
                onClick={() => setPeriod(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-6 lg:space-y-3">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <div className="relative w-16 h-16">
              <div className="absolute inset-0 border-4 border-border rounded-full"></div>
              <div className="absolute inset-0 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
            <div className="text-center space-y-2">
              <p className="text-lg font-semibold text-foreground">Caricamento statistiche...</p>
              <p className="text-sm text-muted-foreground">Analisi dati in corso</p>
            </div>
          </div>
        ) : (
          <Accordion
            type="single"
            collapsible
            defaultValue="timeline"
            className="space-y-3"
          >
            <AccordionItem value="timeline" className="border-0">
              <AccordionTrigger className="text-left">Progress Timeline</AccordionTrigger>
              <AccordionContent>
                {/* Progress Timeline */}
                <motion.section 
              className="space-y-3"
              initial={{ opacity: 0, y: 30, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
            >
              <section className="surface-panel p-6">
                <div className="pb-2">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-base">Progress Timeline</h3>
                      <p>
                        Distanza e ritmo medio nel periodo selezionato.
                      </p>
                    </div>
                    <div className="group relative mt-1">
                      <Info className="w-4 h-4 text-muted-foreground cursor-help" />
                      <div className="absolute right-0 top-6 w-64 rounded-lg border border-border bg-card/95 p-2 text-xs text-foreground opacity-0 transition-opacity group-hover:opacity-100 pointer-events-none z-50">
                        Visualizza l'andamento della distanza percorsa e del pace medio nel periodo selezionato. Utile per identificare trend e progressi nel tempo.
                      </div>
                    </div>
                  </div>
                </div>
                <div>
                  {timelineChartData && timelineChartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={250}>
                      <LineChart data={timelineChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="date" stroke="var(--muted-foreground)" style={{ fontSize: "12px" }} />
                        <YAxis stroke="var(--muted-foreground)" style={{ fontSize: "12px" }} />
                        <Tooltip
                          contentStyle={{
                            background: "var(--card)",
                            border: "1px solid var(--border)",
                            borderRadius: "8px",
                            color: "var(--foreground)",
                          }}
                        />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="distanza"
                          stroke="var(--chart-1)"
                          strokeWidth={2}
                          name="Distanza (km)"
                          dot={{ fill: "var(--chart-1)" }}
                        />
                        <Line
                          type="monotone"
                          dataKey="pace"
                          stroke="var(--chart-2)"
                          strokeWidth={2}
                          name="Pace (min/100m)"
                          dot={{ fill: "var(--chart-2)" }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-center text-muted-foreground py-8">
                      Nessun dato disponibile per questo periodo
                    </p>
                  )}
                </div>
              </section>
            </motion.section>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="performance" className="border-0">
              <AccordionTrigger className="text-left">Analisi prestazioni</AccordionTrigger>
              <AccordionContent>
                {/* Analisi Prestazioni */}
                <motion.section 
              className="space-y-3"
              initial={{ opacity: 0, y: 30, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            >
              {/* HR Zones */}
              {hrZonesData.length > 0 && (
                <section className="surface-panel p-6">
                  <div className="pb-2">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-base">Zone frequenza cardiaca</h3>
                        <p>
                          Distribuzione del tempo nelle diverse zone.
                        </p>
                      </div>
                      <div className="group relative mt-1">
                        <Info className="w-4 h-4 text-muted-foreground cursor-help" />
                        <div className="absolute right-0 top-6 w-72 rounded-lg border border-border bg-card/95 p-2 text-xs text-foreground opacity-0 transition-opacity group-hover:opacity-100 pointer-events-none z-50">
                          Mostra la distribuzione percentuale del tempo trascorso in ciascuna zona di frequenza cardiaca. Z1: Recupero, Z2: Aerobica, Z3: Soglia, Z4: Anaerobica, Z5: Massima.
                        </div>
                      </div>
                    </div>
                  </div>
                  <div>
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
                              background: "var(--card)",
                              border: "1px solid var(--border)",
                              borderRadius: "8px",
                              color: "var(--foreground)",
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
                </section>
              )}

              {/* Pace Distribution */}
              {performance && performance.paceDistribution.length > 0 && (
                <section className="surface-panel p-6">
                  <div className="pb-2">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-base">Distribuzione pace</h3>
                        <p>
                          Sessioni per fascia di ritmo (min/100m).
                        </p>
                      </div>
                      <div className="group relative mt-1">
                        <Info className="w-4 h-4 text-muted-foreground cursor-help" />
                        <div className="absolute right-0 top-6 w-72 rounded-lg border border-border bg-card/95 p-2 text-xs text-foreground opacity-0 transition-opacity group-hover:opacity-100 pointer-events-none z-50">
                          Mostra quante sessioni hai completato in ciascun range di pace (min/100m). Ti aiuta a capire a quale velocità nuoti più frequentemente.
                        </div>
                      </div>
                    </div>
                  </div>
                  <div>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={performance.paceDistribution}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="range" stroke="var(--muted-foreground)" style={{ fontSize: "12px" }} />
                        <YAxis stroke="var(--muted-foreground)" style={{ fontSize: "12px" }} />
                        <Tooltip
                          contentStyle={{
                            background: "var(--card)",
                            border: "1px solid var(--border)",
                            borderRadius: "8px",
                            color: "var(--foreground)",
                          }}
                        />
                        <Bar dataKey="count" fill="var(--chart-1)" name="Sessioni" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </section>
              )}

              {/* Calories & SWOLF */}
              {performance && (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <section className="surface-panel p-6">
                    <div className="pb-2">
                      <h3 className="text-base">Calorie totali</h3>
                      <p>Energia spesa nel periodo</p>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-foreground">
                        {performance.caloriesTotal.toLocaleString()}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Media: {performance.avgCaloriesPerSession}/sessione
                      </div>
                    </div>
                  </section>
                  {performance.swolfAvg && (
                    <section className="surface-panel p-6">
                      <div className="pb-2">
                        <h3 className="text-base">SWOLF medio</h3>
                        <p>Efficienza nuotata</p>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-foreground">
                          {performance.swolfAvg}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Valore più basso = migliore efficienza
                        </div>
                      </div>
                    </section>
                  )}
                </div>
              )}
              </motion.section>
              </AccordionContent>
            </AccordionItem>

            {/* Analisi Avanzate */}
            {advanced && (
              <AccordionItem value="advanced" className="border-0">
                <AccordionTrigger className="text-left">Analisi avanzate</AccordionTrigger>
                <AccordionContent>
                  <motion.section 
                className="space-y-3"
                initial={{ opacity: 0, y: 30, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: 0.3, type: "spring", stiffness: 200 }}
              >
                {/* Core Rings */}
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <RingMetric
                    label="Performance"
                    value={advanced.performanceIndex}
                    color="var(--chart-1)"
                    info={metricsDefinitions.performanceIndex}
                  />
                  <RingMetric
                    label="Consistency"
                    value={advanced.consistencyScore}
                    color="var(--chart-2)"
                    info={metricsDefinitions.consistencyScore}
                  />
                  <RingMetric
                    label="Recovery"
                    value={advanced.recoveryReadinessScore}
                    color="var(--chart-3)"
                    info={metricsDefinitions.rrs}
                  />
                  <StreakRing current={advanced.streak.current} record={advanced.streak.record} />
                </div>

                {/* Advanced Swimming Metrics */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Metriche avanzate
                  </h3>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    <RingMetric
                      label="SEI"
                      value={advanced.swimmingEfficiencyIndex}
                      color="var(--chart-5)"
                      info={metricsDefinitions.sei}
                    />
                    <RingMetric
                      label="TCI"
                      value={advanced.technicalConsistencyIndex}
                      color="var(--chart-4)"
                      info={metricsDefinitions.tci}
                    />
                    <RingMetric
                      label="SER"
                      value={advanced.strokeEfficiencyRating}
                      color="var(--chart-3)"
                      info={metricsDefinitions.ser}
                    />
                    <RingMetric
                      label="ACS"
                      value={advanced.aerobicCapacityScore}
                      color="var(--chart-2)"
                      info={metricsDefinitions.acs}
                    />
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <GaugeMetric
                      label="Progressive Overload"
                      value={progressiveOverloadValue}
                      info={metricsDefinitions.poi}
                    />
                    <GaugeMetric
                      label="Trend"
                      value={trendValue}
                      min={-50}
                      max={50}
                      neutralRange={2}
                      info={metricsDefinitions.trend}
                    />
                  </div>
                </div>

                {/* Predictions */}
                {advanced.predictions && (
                  <section className="surface-panel p-6">
                    <div className="pb-2">
                      <h3 className="text-base">Previsioni</h3>
                      <p>Stima di obiettivi al ritmo attuale.</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">
                        Al ritmo attuale raggiungerai{" "}
                        <span className="font-bold text-foreground">
                          {advanced.predictions.targetKm}km
                        </span>{" "}
                        entro il{" "}
                        <span className="font-bold text-foreground">
                          {new Date(advanced.predictions.estimatedDate).toLocaleDateString("it-IT")}
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        ({advanced.predictions.daysRemaining} giorni rimasti)
                      </p>
                    </div>
                  </section>
                )}
              </motion.section>
                </AccordionContent>
              </AccordionItem>
            )}
          </Accordion>
        )}
        </div>
      </div>
    </AppLayout>
  );
}
