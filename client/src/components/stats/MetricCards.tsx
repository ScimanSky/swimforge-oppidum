/**
 * «Metriche» of Statistiche: six collapsible cards (all closed at start), each with name, main
 * value and short reading in the header; open, the chart, «Come si legge», the data basis and
 * «Come si calcola» (formula, source and conventions from `shared/swimMetrics.ts`).
 */
import { useId, useState, type ReactNode } from "react";
import {
  SWIM_METRIC_DEFINITIONS,
  type SwimMetricKey,
  type SwimMetrics,
} from "@shared/swimMetrics";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Metric } from "@/components/corsia/Metric";
import { ZoneBar } from "@/components/corsia/ZoneBar";
import { formatDecimal, formatInteger, formatPaceValue, formatSignedInteger, NO_VALUE } from "@/lib/format";
import {
  cssDroppedLabel,
  cssFitText,
  cssPointLabel,
  efficiencyComparison,
  efficiencyStrokeRate,
  formatSignedDecimal,
  intensityCoverageText,
  loadEstimatedText,
  loadRampText,
  METRIC_ORDER,
  metricHeaders,
  PACE_ZONE_NAMES,
  strokeHolding,
  zonePaceRows,
  type MetricHeader,
} from "@/lib/swim-metrics-view";
import {
  CssHistoryChart,
  EfficiencyChart,
  IntensityChart,
  LoadChart,
  PacingCvChart,
  PacingDpsChart,
  PacingSetChart,
  VolumeChart,
} from "./MetricCharts";
import { CssTestDialog } from "./CssTestDialog";

/** Shown next to «—» when a metric has no value. */
const NO_DATA_READING = "servono più dati";

const metricGrid = "grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4";
const sectionTitle = "text-xs font-semibold text-muted-foreground";

function MetricCard({
  metricKey,
  header,
  onExplain,
  actions,
  children,
}: {
  metricKey: SwimMetricKey;
  header: MetricHeader;
  onExplain: () => void;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  const definition = SWIM_METRIC_DEFINITIONS[metricKey];
  return (
    <AccordionItem value={metricKey} className="surface-panel last:border-b">
      <AccordionTrigger headingLevel={3} className="items-center px-4 py-3 hover:no-underline">
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[15px] font-semibold text-foreground">{definition.name}</span>{" "}
          <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="whitespace-nowrap font-display text-2xl font-bold leading-tight tabular-nums text-foreground">
              {header.value ?? NO_VALUE}
              {header.value && header.unit ? (
                <>
                  {" "}
                  <span className="text-[0.55em] font-semibold text-muted-foreground">{header.unit}</span>
                </>
              ) : null}
            </span>{" "}
            <span className="text-sm font-normal text-muted-foreground">
              {header.value ? header.reading : NO_DATA_READING}
            </span>
          </span>
        </span>
      </AccordionTrigger>
      <AccordionContent className="space-y-4 px-4 pb-4 pt-1">
        {header.missing ? <p className="rounded-xl bg-raised p-3 text-sm">{header.missing}</p> : null}
        {children}
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">Come si legge:</span> {definition.howToRead}
          {header.readingNow ? <> {header.readingNow}</> : null}
        </p>
        {header.basis ? <p className="text-xs text-muted-foreground">{header.basis}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={onExplain}>
            Come si calcola<span className="sr-only">: {definition.name}</span>
          </Button>
          {actions}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

function CssBody({ metrics }: { metrics: SwimMetrics }) {
  const css = metrics.css.current;
  const listTitle = css?.source === "test" ? "I tempi del test" : "Tratti usati per la stima";
  const listTitleId = useId();
  const droppedTitleId = useId();
  const dropped = css?.source === "stima" ? (css.droppedPoints ?? []) : [];
  const fit = css ? cssFitText(css) : null;
  return (
    <>
      <CssHistoryChart history={metrics.css.history} />
      {css && css.points.length > 0 ? (
        <div>
          <p id={listTitleId} className={sectionTitle}>
            {listTitle}
          </p>
          <ul aria-labelledby={listTitleId} className="mt-1 space-y-0.5 text-sm tabular-nums">
            {css.points.map((point) => (
              <li key={`${point.distanceMeters}-${point.date}`}>{cssPointLabel(point)}</li>
            ))}
          </ul>
          {fit ? <p className="mt-2 text-xs text-muted-foreground">{fit}</p> : null}
        </div>
      ) : null}
      {dropped.length > 0 ? (
        <div>
          <p id={droppedTitleId} className={sectionTitle}>
            Non usati: più lenti per 100 m di un tratto più lungo, quindi non a tutta
          </p>
          <ul aria-labelledby={droppedTitleId} className="mt-1 space-y-0.5 text-sm tabular-nums">
            {dropped.map((point) => (
              <li key={`${point.distanceMeters}-${point.date}`}>{cssDroppedLabel(point)}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}

function LoadBody({ metrics }: { metrics: SwimMetrics }) {
  const ramp = loadRampText(metrics.load.rampPerWeek);
  const estimated = metrics.load.today ? loadEstimatedText(metrics) : null;
  return (
    <>
      <LoadChart load={metrics.load} sessions={metrics.sessions} />
      {ramp ? <p className="text-sm">{ramp}</p> : null}
      {estimated ? <p className="text-sm">{estimated}</p> : null}
    </>
  );
}

/** Z1..Z5 as paces you can swim, from today's threshold pace. */
function ZonePaceTable({ cssPace }: { cssPace: number }) {
  return (
    <table className="w-full max-w-md text-sm tabular-nums">
      <caption className={`${sectionTitle} mb-1 text-left`}>
        Passo delle zone, dal passo soglia {formatPaceValue(cssPace)}
      </caption>
      <thead className="sr-only">
        <tr>
          <th scope="col">Zona</th>
          <th scope="col">Passo per 100 m</th>
        </tr>
      </thead>
      <tbody>
        {zonePaceRows(cssPace).map((row) => (
          <tr key={row.zone} className="border-b border-border last:border-0">
            <th scope="row" className="py-1.5 pr-3 text-left font-normal">
              <span className="flex items-center gap-2">
                <span aria-hidden className="size-2.5 shrink-0 rounded-sm" style={{ background: `var(--zone-${row.zone})` }} />
                Z{row.zone} {row.name}
              </span>
            </th>
            <td className="py-1.5 text-right">
              {row.pace} <span className="text-xs text-muted-foreground">/100 m</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function IntensityBody({ metrics }: { metrics: SwimMetrics }) {
  const last28 = metrics.intensity.last28;
  const coverage = intensityCoverageText(metrics);
  const css = metrics.css.current;
  return (
    <>
      {last28 ? (
        <div>
          <p className={`${sectionTitle} mb-2`}>Ultime 4 settimane, a stile libero</p>
          <ZoneBar seconds={last28.zoneMeters} names={PACE_ZONE_NAMES} />
          {coverage ? <p className="mt-2 text-sm">{coverage}</p> : null}
        </div>
      ) : null}
      {css && last28 ? <ZonePaceTable cssPace={css.paceSecondsPer100} /> : null}
      <IntensityChart weeks={metrics.intensity.weeks} />
    </>
  );
}

function EfficiencyBody({ metrics }: { metrics: SwimMetrics }) {
  const e = metrics.efficiency;
  const comparison = efficiencyComparison(e);
  const hasBaseline = e.baseline !== null;
  const strokeRate = efficiencyStrokeRate(metrics);
  const numbers = [
    e.latest !== null ? { value: formatDecimal(e.latest, 2), label: "Ultima nuotata" } : null,
    strokeRate !== null ? { value: formatInteger(strokeRate), label: "Bracciate al minuto" } : null,
  ].filter((number) => number !== null);
  return (
    <>
      <EfficiencyChart metrics={metrics} />
      {comparison.rows.length > 0 ? (
        <div>
          <table className="w-full max-w-md text-sm tabular-nums">
            <caption className={`${sectionTitle} mb-1 text-left`}>
              {hasBaseline ? "Ultime 4 settimane e la tua base (mediane)" : "Ultime 4 settimane (mediane)"}
            </caption>
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <td />
                <th scope="col" className="py-1 text-right font-semibold">
                  Ultime 4 settimane
                </th>
                {hasBaseline ? (
                  <th scope="col" className="py-1 pl-3 text-right font-semibold">
                    La tua base
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {comparison.rows.map((row) => (
                <tr key={row.label} className="border-b border-border last:border-0">
                  <th scope="row" className="py-1.5 pr-3 text-left font-normal">
                    {row.label}
                  </th>
                  <td className="whitespace-nowrap py-1.5 text-right">{row.recent}</td>
                  {hasBaseline ? (
                    <td className="whitespace-nowrap py-1.5 pl-3 text-right">{row.baseline ?? NO_VALUE}</td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
          {comparison.reading ? <p className="mt-2 text-sm">{comparison.reading}</p> : null}
        </div>
      ) : null}
      {numbers.length > 0 ? (
        <ul className={metricGrid}>
          {numbers.map((number) => (
            <li key={number.label}>
              <Metric {...number} size="sm" />
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

const signedPctValue = (value: number) => formatSignedDecimal(value, 1);

function PacingBody({ metrics }: { metrics: SwimMetrics }) {
  const p = metrics.pacing;
  const holding = strokeHolding(metrics);
  const numbers = [
    p.fade28 !== null ? { value: signedPctValue(p.fade28), unit: "%", label: "Calo nel finale" } : null,
    holding?.dpsChange != null
      ? { value: signedPctValue(holding.dpsChange), unit: "%", label: "Bracciata nel finale" }
      : null,
    holding?.strokeRateRise != null
      ? { value: signedPctValue(holding.strokeRateRise), unit: "%", label: "Frequenza nel finale" }
      : null,
  ].filter((number) => number !== null);
  return (
    <>
      {p.latestSet ? <PacingSetChart set={p.latestSet} /> : null}
      {p.latestSet ? <PacingDpsChart set={p.latestSet} /> : null}
      {numbers.length > 0 ? (
        <ul className={metricGrid}>
          {numbers.map((number) => (
            <li key={number.label}>
              <Metric {...number} size="sm" />
            </li>
          ))}
        </ul>
      ) : null}
      {holding ? (
        <p className="text-sm">
          <span className="font-semibold">Tenuta della bracciata:</span> {holding.text}
        </p>
      ) : null}
      <PacingCvChart metrics={metrics} />
    </>
  );
}

function VolumeBody({ metrics }: { metrics: SwimMetrics }) {
  const v = metrics.volume;
  if (!v.weeks.some((week) => week.sessions > 0)) return null;
  const change = formatSignedInteger(v.changePct);
  return (
    <>
      <VolumeChart volume={v} />
      <ul className={metricGrid}>
        <li>
          <Metric value={formatDecimal(v.avgSessions4, 1)} label="Nuotate a settimana" size="sm" />
        </li>
        {change !== null ? (
          <li>
            <Metric value={change} unit="%" label="Sulle 4 precedenti" size="sm" />
          </li>
        ) : null}
        <li>
          <Metric value={formatInteger(v.streakWeeks)} unit="sett." label="Serie" size="sm" />
        </li>
      </ul>
    </>
  );
}

const BODIES: Record<SwimMetricKey, (props: { metrics: SwimMetrics }) => ReactNode> = {
  css: CssBody,
  load: LoadBody,
  intensity: IntensityBody,
  efficiency: EfficiencyBody,
  pacing: PacingBody,
  volume: VolumeBody,
};

function DefinitionDialog({
  metricKey,
  open,
  onOpenChange,
}: {
  metricKey: SwimMetricKey | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const definition = metricKey ? SWIM_METRIC_DEFINITIONS[metricKey] : null;
  const conventionsId = useId();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {definition ? (
          <>
            <DialogHeader>
              <DialogTitle>{definition.name}</DialogTitle>
              <DialogDescription>{definition.measures}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 text-sm">
              <section>
                <h3 className="font-semibold">Come si calcola</h3>
                <p className="mt-1 rounded-xl bg-raised p-3">{definition.formula}</p>
              </section>
              <section>
                <h3 className="font-semibold">Fonte</h3>
                <p className="mt-1 text-muted-foreground">{definition.source}</p>
              </section>
              {definition.conventions?.length ? (
                <section>
                  <h3 id={conventionsId} className="font-semibold">
                    Convenzioni
                  </h3>
                  <ul
                    aria-labelledby={conventionsId}
                    className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground"
                  >
                    {definition.conventions.map((convention) => (
                      <li key={convention}>{convention}</li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function MetricCards({ metrics }: { metrics: SwimMetrics }) {
  const headers = metricHeaders(metrics);
  // The key outlives the open state, so the dialog keeps its text while it closes.
  const [explained, setExplained] = useState<SwimMetricKey | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      <Accordion type="multiple" className="space-y-3">
        {METRIC_ORDER.map((key) => {
          const Body = BODIES[key];
          return (
            <MetricCard
              key={key}
              metricKey={key}
              header={headers[key]}
              onExplain={() => {
                setExplained(key);
                setDialogOpen(true);
              }}
              actions={key === "css" ? <CssTestDialog current={metrics.css.current} /> : undefined}
            >
              <Body metrics={metrics} />
            </MetricCard>
          );
        })}
      </Accordion>
      <DefinitionDialog metricKey={explained} open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}
