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
import { formatDecimal, formatInteger, formatSignedInteger, NO_VALUE } from "@/lib/format";
import {
  cssPointLabel,
  efficiencyDetails,
  loadRampText,
  METRIC_ORDER,
  metricHeaders,
  PACE_ZONE_NAMES,
  type MetricHeader,
} from "@/lib/swim-metrics-view";
import {
  CssHistoryChart,
  EfficiencyChart,
  IntensityChart,
  LoadChart,
  PacingCvChart,
  PacingSetChart,
  VolumeChart,
} from "./MetricCharts";
import { CssTestDialog } from "./CssTestDialog";

/** Shown next to «—» when a metric has no value. */
const NO_DATA_READING = "servono più dati";

const metricGrid = "grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4";

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
  return (
    <>
      <CssHistoryChart history={metrics.css.history} />
      {css && css.points.length > 0 ? (
        <div>
          <p id={listTitleId} className="text-xs font-semibold text-muted-foreground">
            {listTitle}
          </p>
          <ul aria-labelledby={listTitleId} className="mt-1 space-y-0.5 text-sm tabular-nums">
            {css.points.map((point) => (
              <li key={`${point.distanceMeters}-${point.date}`}>{cssPointLabel(point)}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}

function LoadBody({ metrics }: { metrics: SwimMetrics }) {
  const ramp = loadRampText(metrics.load.rampPerWeek);
  return (
    <>
      <LoadChart load={metrics.load} />
      {ramp ? <p className="text-sm">{ramp}</p> : null}
    </>
  );
}

function IntensityBody({ metrics }: { metrics: SwimMetrics }) {
  const last28 = metrics.intensity.last28;
  return (
    <>
      {last28 ? (
        <div>
          <p className="mb-2 text-xs font-semibold text-muted-foreground">Ultime 4 settimane</p>
          <ZoneBar seconds={last28.zoneMeters} names={PACE_ZONE_NAMES} />
        </div>
      ) : null}
      <IntensityChart weeks={metrics.intensity.weeks} />
    </>
  );
}

function EfficiencyBody({ metrics }: { metrics: SwimMetrics }) {
  const e = metrics.efficiency;
  const details = efficiencyDetails(metrics);
  const numbers = [
    e.latest !== null ? { value: formatDecimal(e.latest, 2), label: "Ultima nuotata" } : null,
    e.baseline !== null ? { value: formatDecimal(e.baseline, 2), label: "La tua base" } : null,
    details.dps !== null ? { value: formatDecimal(details.dps, 2), unit: "m", label: "Distanza per ciclo" } : null,
    details.strokeRate !== null ? { value: formatInteger(details.strokeRate), label: "Bracciate al minuto" } : null,
  ].filter((number) => number !== null);
  return (
    <>
      <EfficiencyChart metrics={metrics} />
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

function PacingBody({ metrics }: { metrics: SwimMetrics }) {
  const p = metrics.pacing;
  return (
    <>
      {p.latestSet ? <PacingSetChart set={p.latestSet} /> : null}
      <PacingCvChart metrics={metrics} />
      {p.fade28 !== null ? (
        <Metric
          value={p.fade28 > 0 ? `+${formatDecimal(p.fade28, 1)}` : formatDecimal(p.fade28, 1)}
          unit="%"
          label="Calo nel finale"
          size="sm"
        />
      ) : null}
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
