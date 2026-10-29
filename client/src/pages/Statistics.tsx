import { useState } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Activity, BarChart3, Gauge } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { LoadError, LoadingSkeleton } from "@/components/corsia/LoadState";
import { Metric } from "@/components/corsia/Metric";
import { ZoneBar } from "@/components/corsia/ZoneBar";
import { MetricCards } from "@/components/stats/MetricCards";
import { formatDayMonth, formatInteger, formatPaceValue } from "@/lib/format";

const PERIOD_OPTIONS = [
  { value: 7, label: "7 giorni" },
  { value: 30, label: "30 giorni" },
  { value: 90, label: "90 giorni" },
  { value: 365, label: "1 anno" },
];

const tooltipStyle = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: "12px",
  color: "var(--foreground)",
};
const axisTick = { fill: "var(--muted-foreground)", fontSize: 12 };

const kmNumber = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1 });
const formatKmNumber = (km: number) => kmNumber.format(km);

/** Tooltip values of the «Andamento» chart: «2,5 km», «1:52 /100 m». */
const timelineTooltipValue = (value: unknown, name: string, item: { dataKey?: unknown }) => {
  const number = Number(value);
  if (item.dataKey === "passo") return [`${formatPaceValue(number)} /100 m`, name];
  return [`${formatKmNumber(number)} km`, name];
};

const accordionTrigger =
  "rounded-2xl border border-border bg-card px-4 py-3 text-left text-[15px] font-semibold hover:no-underline";
const cardTitle = "text-base font-bold text-foreground";

const HR_ZONE_NAMES = ["Recupero", "Aerobica", "Soglia", "Anaerobica", "Massima"] as const;

export default function Statistics() {
  const [period, setPeriod] = useState(30);
  // Controlled, so the open section survives the loading state of a new period.
  const [openSection, setOpenSection] = useState("timeline");
  // Keep showing the previous period while the new one loads.
  const queryOptions = { staleTime: 5 * 60 * 1000, placeholderData: keepPreviousData };

  const { data: timeline, isLoading: timelineLoading } = trpc.statistics.getTimeline.useQuery(
    { days: period },
    queryOptions
  );
  const { data: performance, isLoading: performanceLoading } = trpc.statistics.getPerformance.useQuery(
    { days: period },
    queryOptions
  );
  // Swim metrics have their own windows (28 and 90 days): not tied to the period, loaded apart.
  const metricsQuery = trpc.statistics.getMetrics.useQuery(undefined, { staleTime: 5 * 60 * 1000 });

  const isLoading = timelineLoading || performanceLoading;

  // Percent of time in zones 1-5 (ZoneBar only needs the proportions).
  const hrZones = performance
    ? [
        performance.hrZones.zone1,
        performance.hrZones.zone2,
        performance.hrZones.zone3,
        performance.hrZones.zone4,
        performance.hrZones.zone5,
      ]
    : [];
  const hasHrZones = hrZones.some((value) => value > 0);

  // Chart data: distance in km, pace in seconds per 100 m (formatted as mm:ss on axis and tooltip).
  const timelineChartData = timeline?.map((point) => ({
    date: formatDayMonth(point.date),
    distanza: point.distance,
    passo: point.pace ?? null,
    sessioni: point.sessions,
  }));
  const timelineSummary = (() => {
    if (!timeline || timeline.length === 0) return null;
    const totalKm = timeline.reduce((sum, point) => sum + (point.distance || 0), 0);
    const sessions = timeline.reduce((sum, point) => sum + (point.sessions || 0), 0);
    const paced = timeline.filter((point) => point.pace);
    const pacedSessions = paced.reduce((sum, point) => sum + (point.sessions || 1), 0);
    const avgPace = pacedSessions
      ? paced.reduce((sum, point) => sum + point.pace! * (point.sessions || 1), 0) / pacedSessions
      : null;
    return [
      `Nel periodo ${formatKmNumber(totalKm)} km in ${formatInteger(sessions)} ${sessions === 1 ? "nuotata" : "nuotate"}`,
      avgPace ? `, passo medio ${formatPaceValue(avgPace)} /100 m` : "",
      ".",
    ].join("");
  })();
  const paceDistributionSummary =
    performance && performance.paceDistribution.length > 0
      ? `Nuotate per fascia di passo: ${performance.paceDistribution
          .map((band) => `${band.range} ${formatInteger(band.count)}`)
          .join(", ")}.`
      : null;

  return (
    <AppLayout>
      <div className="space-y-4">
        <div role="group" aria-label="Periodo" className="flex flex-wrap gap-2">
          {PERIOD_OPTIONS.map((option) => (
            <Button
              key={option.value}
              size="sm"
              variant={period === option.value ? "default" : "secondary"}
              aria-pressed={period === option.value}
              onClick={() => setPeriod(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>

        {isLoading ? (
          <div role="status" className="flex flex-col items-center justify-center gap-3 py-20">
            <Spinner aria-hidden className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Caricamento statistiche…</p>
          </div>
        ) : (
          <Accordion
            type="single"
            collapsible
            value={openSection}
            onValueChange={setOpenSection}
            className="space-y-3"
          >
            <AccordionItem value="timeline" className="border-0">
              <AccordionTrigger headingLevel={2} className={accordionTrigger}>
                <span className="inline-flex items-center gap-2">
                  <BarChart3 className="size-4 text-muted-foreground" aria-hidden />
                  Andamento
                </span>
              </AccordionTrigger>
              <AccordionContent className="pt-3">
                <section className="surface-panel p-4">
                  <p className="text-sm text-muted-foreground">
                    Distanza e passo medio nel periodo scelto.
                  </p>
                  <div className="mt-4">
                    {timelineChartData && timelineChartData.length > 0 ? (
                      <>
                        {timelineSummary ? <p className="sr-only">{timelineSummary}</p> : null}
                        <ResponsiveContainer width="100%" height={250}>
                          <LineChart data={timelineChartData} accessibilityLayer>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                            <XAxis dataKey="date" stroke="var(--border)" tick={axisTick} />
                            <YAxis
                              yAxisId="distance"
                              stroke="var(--border)"
                              tick={axisTick}
                              width={36}
                              tickFormatter={(value: number) => formatKmNumber(value)}
                            />
                            <YAxis
                              yAxisId="pace"
                              orientation="right"
                              stroke="var(--border)"
                              tick={axisTick}
                              width={40}
                              domain={["auto", "auto"]}
                              tickFormatter={(value: number) => formatPaceValue(value)}
                            />
                            <Tooltip contentStyle={tooltipStyle} formatter={timelineTooltipValue} />
                            <Legend wrapperStyle={{ fontSize: 12 }} />
                            <Line
                              yAxisId="distance"
                              type="monotone"
                              dataKey="distanza"
                              stroke="var(--chart-1)"
                              strokeWidth={2}
                              name="Distanza"
                              dot={{ fill: "var(--chart-1)" }}
                            />
                            <Line
                              yAxisId="pace"
                              type="monotone"
                              dataKey="passo"
                              stroke="var(--chart-2)"
                              strokeWidth={2}
                              name="Passo"
                              dot={{ fill: "var(--chart-2)" }}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </>
                    ) : (
                      <p className="py-8 text-center text-sm text-muted-foreground">
                        Nessun dato in questo periodo
                      </p>
                    )}
                  </div>
                </section>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="performance" className="border-0">
              <AccordionTrigger headingLevel={2} className={accordionTrigger}>
                <span className="inline-flex items-center gap-2">
                  <Gauge className="size-4 text-muted-foreground" aria-hidden />
                  Analisi prestazioni
                </span>
              </AccordionTrigger>
              <AccordionContent className="space-y-3 pt-3">
                {hasHrZones && (
                  <section className="surface-panel p-4">
                    <h3 className={cardTitle}>Zone cardio</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Tempo nelle cinque zone di frequenza cardiaca.
                    </p>
                    <ZoneBar seconds={hrZones} names={HR_ZONE_NAMES} className="mt-4" />
                  </section>
                )}

                {performance && performance.paceDistribution.length > 0 && (
                  <section className="surface-panel p-4">
                    <h3 className={cardTitle}>Distribuzione del passo</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Nuotate per fascia di passo (min/100 m).
                    </p>
                    {paceDistributionSummary ? (
                      <p className="sr-only">{paceDistributionSummary}</p>
                    ) : null}
                    <div className="mt-4">
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={performance.paceDistribution} accessibilityLayer>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                          <XAxis dataKey="range" stroke="var(--border)" tick={axisTick} />
                          <YAxis stroke="var(--border)" tick={axisTick} width={36} allowDecimals={false} />
                          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--raised)" }} />
                          <Bar dataKey="count" fill="var(--chart-1)" name="Nuotate" radius={[6, 6, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </section>
                )}

                {performance && (performance.caloriesTotal > 0 || performance.swolfAvg) ? (
                  <section className="surface-panel grid grid-cols-2 gap-x-4 gap-y-5 p-4">
                    {performance.caloriesTotal > 0 ? (
                      <div>
                        <Metric
                          value={formatInteger(performance.caloriesTotal)}
                          unit="kcal"
                          label="Calorie totali"
                          size="responsive"
                        />
                        <p className="mt-1 text-xs text-muted-foreground">
                          Media {formatInteger(performance.avgCaloriesPerSession)} kcal a nuotata
                        </p>
                      </div>
                    ) : null}
                    {performance.swolfAvg ? (
                      <div>
                        <Metric
                          value={formatInteger(performance.swolfAvg)}
                          label="SWOLF medio"
                          size="responsive"
                        />
                        <p className="mt-1 text-xs text-muted-foreground">Più basso è, meglio è</p>
                      </div>
                    ) : null}
                  </section>
                ) : null}
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="metrics" className="border-0">
              <AccordionTrigger headingLevel={2} className={accordionTrigger}>
                <span className="inline-flex items-center gap-2">
                  <Activity className="size-4 text-muted-foreground" aria-hidden />
                  Metriche
                </span>
              </AccordionTrigger>
              <AccordionContent className="space-y-3 pt-3">
                <p className="text-sm text-muted-foreground">
                  Ogni metrica usa i suoi giorni, indicati nel riquadro: il periodo scelto sopra non le cambia.
                </p>
                {metricsQuery.data ? (
                  <MetricCards metrics={metricsQuery.data} />
                ) : metricsQuery.isError ? (
                  <LoadError onRetry={() => void metricsQuery.refetch()} />
                ) : (
                  <LoadingSkeleton
                    label="Caricamento delle metriche…"
                    count={6}
                    itemClassName="h-[76px] w-full rounded-2xl"
                  />
                )}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}
      </div>
    </AppLayout>
  );
}
