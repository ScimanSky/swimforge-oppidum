import { useState } from "react";
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
import { BarChart3, Gauge, Info, Sparkles } from "lucide-react";
import { metricsDefinitions } from "@/data/metricsDefinitions";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Metric } from "@/components/corsia/Metric";
import { ZoneBar } from "@/components/corsia/ZoneBar";
import { formatDayMonth, formatDayMonthYear, formatInteger } from "@/lib/format";

const PERIOD_OPTIONS = [
  { value: 7, label: "7 giorni" },
  { value: 30, label: "30 giorni" },
  { value: 90, label: "90 giorni" },
  { value: 365, label: "1 anno" },
];

type MetricInfo = (typeof metricsDefinitions)[keyof typeof metricsDefinitions];

const tooltipStyle = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: "12px",
  color: "var(--foreground)",
};
const axisTick = { fill: "var(--muted-foreground)", fontSize: 12 };

const accordionTrigger =
  "rounded-2xl border border-border bg-card px-4 py-3 text-left text-[15px] font-semibold hover:no-underline";
const cardTitle = "text-base font-bold text-foreground";

function MetricInfoButton({ label, info }: { label: string; info: MetricInfo }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="-m-2 flex size-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
        aria-label={`Come si calcola: ${label}`}
      >
        <Info className="size-4" aria-hidden />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{info.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm text-muted-foreground">
            <p>{info.description}</p>
            <div className="whitespace-pre-line rounded-xl bg-raised p-3 text-xs text-foreground">
              {info.formula}
            </div>
            <div>
              <h3 className="mb-2 font-semibold text-foreground">Interpretazione</h3>
              <ul className="space-y-1">
                <li><strong>Ottimo:</strong> {info.interpretation.excellent}</li>
                <li><strong>Buono:</strong> {info.interpretation.good}</li>
                <li><strong>Discreto:</strong> {info.interpretation.fair}</li>
                <li><strong>Scarso:</strong> {info.interpretation.poor}</li>
              </ul>
            </div>
            <div>
              <h3 className="mb-2 font-semibold text-foreground">Come migliorare</h3>
              <ul className="list-disc space-y-1 pl-5">
                {info.howToImprove.map((tip: string, idx: number) => (
                  <li key={idx}>{tip}</li>
                ))}
              </ul>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Tile for one score: Metric (value out of `max`) and the «how it is computed» button. */
function ScoreTile({
  label,
  value,
  unit,
  info,
}: {
  label: string;
  value: string | null;
  unit?: string;
  info?: MetricInfo;
}) {
  return (
    <div className="flex items-start justify-between gap-2 rounded-2xl bg-raised p-4">
      {value !== null ? (
        <Metric value={value} unit={unit} label={label} size="responsive" />
      ) : (
        <span className="block min-w-0">
          <span className="block text-sm text-muted-foreground">Dati insufficienti</span>
          <span className="mt-1.5 block truncate text-xs font-medium text-muted-foreground">
            {label}
          </span>
        </span>
      )}
      {info ? <MetricInfoButton label={label} info={info} /> : null}
    </div>
  );
}

const scoreValue = (value: number | null | undefined) =>
  value !== null && value !== undefined && Number.isFinite(value) ? formatInteger(value) : null;

/** Signed percentage («+12», «−4», «0» inside the neutral range). */
const signedValue = (value: number | null, neutralRange = 0) => {
  if (value === null || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  if (Math.abs(rounded) <= neutralRange || rounded === 0) return "0";
  return rounded > 0 ? `+${formatInteger(rounded)}` : `−${formatInteger(-rounded)}`;
};

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
	      staleTime: 5 * 60 * 1000, // Server-side insights remain cached; keep client cache short.
	    }
	  );

  const isLoading = timelineLoading || performanceLoading || advancedLoading;

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

  // Format timeline data for chart
  const timelineChartData = timeline?.map((point) => ({
    date: formatDayMonth(point.date),
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

  const streak = advanced?.streak;

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
          <Accordion type="single" collapsible defaultValue="timeline" className="space-y-3">
            <AccordionItem value="timeline" className="border-0">
              <AccordionTrigger className={accordionTrigger}>
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
                      <ResponsiveContainer width="100%" height={250}>
                        <LineChart data={timelineChartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                          <XAxis dataKey="date" stroke="var(--border)" tick={axisTick} />
                          <YAxis stroke="var(--border)" tick={axisTick} width={36} />
                          <Tooltip contentStyle={tooltipStyle} />
                          <Legend wrapperStyle={{ fontSize: 12 }} />
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
                            name="Passo (min/100 m)"
                            dot={{ fill: "var(--chart-2)" }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
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
              <AccordionTrigger className={accordionTrigger}>
                <span className="inline-flex items-center gap-2">
                  <Gauge className="size-4 text-muted-foreground" aria-hidden />
                  Analisi prestazioni
                </span>
              </AccordionTrigger>
              <AccordionContent className="space-y-3 pt-3">
                {hasHrZones && (
                  <section className="surface-panel p-4">
                    <h4 className={cardTitle}>Zone cardio</h4>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Tempo nelle cinque zone di frequenza cardiaca.
                    </p>
                    <ZoneBar seconds={hrZones} className="mt-4" />
                  </section>
                )}

                {performance && performance.paceDistribution.length > 0 && (
                  <section className="surface-panel p-4">
                    <h4 className={cardTitle}>Distribuzione del passo</h4>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Nuotate per fascia di passo (min/100 m).
                    </p>
                    <div className="mt-4">
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={performance.paceDistribution}>
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

                {performance && (
                  <section className="surface-panel grid grid-cols-2 gap-x-4 gap-y-5 p-4">
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
                )}
              </AccordionContent>
            </AccordionItem>

            {advanced && (
              <AccordionItem value="advanced" className="border-0">
                <AccordionTrigger className={accordionTrigger}>
                  <span className="inline-flex items-center gap-2">
                    <Sparkles className="size-4 text-muted-foreground" aria-hidden />
                    Analisi avanzate
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-3 pt-3">
                  <section className="surface-panel p-4">
                    <h4 className={cardTitle}>Punteggi</h4>
                    <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                      <ScoreTile
                        label="Prestazione"
                        value={scoreValue(advanced.performanceIndex)}
                        unit="/100"
                        info={metricsDefinitions.performanceIndex}
                      />
                      <ScoreTile
                        label="Costanza"
                        value={scoreValue(advanced.consistencyScore)}
                        unit="/100"
                        info={metricsDefinitions.consistencyScore}
                      />
                      <ScoreTile
                        label="Recupero"
                        value={scoreValue(advanced.recoveryReadinessScore)}
                        unit="/100"
                        info={metricsDefinitions.rrs}
                      />
                      <div className="rounded-2xl bg-raised p-4">
                        <Metric
                          value={formatInteger(streak?.current ?? 0)}
                          unit={streak?.current === 1 ? "giorno" : "giorni"}
                          label="Serie attuale"
                          size="responsive"
                        />
                        <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                          Record {formatInteger(streak?.record ?? 0)} g
                        </p>
                      </div>
                    </div>
                  </section>

                  <section className="surface-panel p-4">
                    <h4 className={cardTitle}>Metriche avanzate</h4>
                    <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                      <ScoreTile
                        label="SEI"
                        value={scoreValue(advanced.swimmingEfficiencyIndex)}
                        unit="/100"
                        info={metricsDefinitions.sei}
                      />
                      <ScoreTile
                        label="TCI"
                        value={scoreValue(advanced.technicalConsistencyIndex)}
                        unit="/100"
                        info={metricsDefinitions.tci}
                      />
                      <ScoreTile
                        label="SER"
                        value={scoreValue(advanced.strokeEfficiencyRating)}
                        unit="/100"
                        info={metricsDefinitions.ser}
                      />
                      <ScoreTile
                        label="ACS"
                        value={scoreValue(advanced.aerobicCapacityScore)}
                        unit="/100"
                        info={metricsDefinitions.acs}
                      />
                      <ScoreTile
                        label="Carico progressivo"
                        value={signedValue(progressiveOverloadValue)}
                        unit="%"
                        info={metricsDefinitions.poi}
                      />
                      <ScoreTile
                        label="Tendenza"
                        value={signedValue(trendValue, 2)}
                        unit="%"
                        info={metricsDefinitions.trend}
                      />
                    </div>
                  </section>

                  {advanced.predictions && (
                    <section className="surface-panel p-4">
                      <h4 className={cardTitle}>Previsioni</h4>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Al ritmo attuale raggiungerai{" "}
                        <span className="font-bold text-foreground tabular-nums">
                          {advanced.predictions.targetKm} km
                        </span>{" "}
                        entro il{" "}
                        <span className="font-bold text-foreground">
                          {formatDayMonthYear(advanced.predictions.estimatedDate)}
                        </span>
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                        {advanced.predictions.daysRemaining} giorni rimasti
                      </p>
                    </section>
                  )}
                </AccordionContent>
              </AccordionItem>
            )}
          </Accordion>
        )}
      </div>
    </AppLayout>
  );
}
