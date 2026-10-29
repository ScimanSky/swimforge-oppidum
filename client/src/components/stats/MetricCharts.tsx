/**
 * Charts of the «Metriche» cards (Corsia: `--chart-*` and `--pace-*`, no gradients, solid
 * hairline grid, one y axis). Each chart is a `role="img"` with a text summary for screen
 * readers; the legend and the numbers around it stay as text. Mounted only while its card is open.
 */
import type { ReactElement, ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";
import {
  emptyZones7,
  TSB_READING_LABELS,
  tsbReadingOf,
  type SessionMetrics,
  type SwimMetrics,
} from "@shared/swimMetrics";
import { formatDecimal, formatInteger, formatKm, formatPaceValue, formatSignedInteger } from "@/lib/format";
import {
  cssChartSummary,
  efficiencyChartSummary,
  efficiencySessions,
  formatClock,
  formatKeyDayMonth,
  formatMonthKey,
  formatSignedDecimal,
  formatSwims,
  intensityChartSummary,
  loadChartSummary,
  pacingCvSummary,
  pacingDpsSummary,
  pacingSessions,
  pacingSetSummary,
  setTitle,
  volumeChartSummary,
  zoneShareItems,
  type ZoneView,
} from "@/lib/swim-metrics-view";
import { cn } from "@/lib/utils";

// ─── Shared pieces ──────────────────────────────────────────────────────────

const TICK = { fill: "var(--muted-foreground)", fontSize: 12 };
const GRID = <CartesianGrid stroke="var(--border)" vertical={false} />;
const MARGIN = { top: 8, right: 8, bottom: 0, left: 0 };
const X_AXIS = {
  stroke: "var(--border)",
  tick: TICK,
  tickLine: false,
  minTickGap: 12,
  interval: "preserveStartEnd" as const,
};
const Y_AXIS = { stroke: "var(--border)", tick: TICK, tickLine: false, axisLine: false, width: 40 };
const TOOLTIP = {
  contentStyle: {
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    color: "var(--foreground)",
    fontSize: 12,
  },
  // Values in text colours, never in the series colour.
  itemStyle: { color: "var(--foreground)" },
  labelStyle: { color: "var(--muted-foreground)" },
  isAnimationActive: false,
};
const BAR_CURSOR = { fill: "var(--raised)" };
const LINE_CURSOR = { stroke: "var(--border)" };
/** Dots with a ring in the surface colour, so they stay readable over the line. */
const dot = (color: string) => ({ r: 4, fill: color, stroke: "var(--card)", strokeWidth: 2 });

const dayLabel = (key: unknown) => formatKeyDayMonth(String(key));

type TooltipRow = { label: string; value: string };

/**
 * Tooltip content with several rows per point (values that are not series of the chart), in the
 * same style as TOOLTIP: title in grey, label and value in text colours.
 */
function detailTooltip<T>(render: (datum: T) => { title: string; rows: TooltipRow[] }) {
  return function DetailTooltip({ active, payload }: TooltipProps<number, string>): ReactNode {
    const datum = payload?.[0]?.payload as T | undefined;
    if (!active || !datum) return null;
    const { title, rows } = render(datum);
    return (
      <div className="rounded-xl border border-border bg-card px-3 py-2 text-xs text-foreground">
        <p className="text-muted-foreground">{title}</p>
        <dl className="mt-1 space-y-0.5">
          {rows.map((row) => (
            <div key={row.label} className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{row.label}</dt>
              <dd className="tabular-nums">{row.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    );
  };
}

/** «+3,1%»: a signed percentage with one decimal. */
const signedPct = (value: number) => `${formatSignedDecimal(value, 1)}%`;

/**
 * Round axis bounds and evenly spaced ticks (at most 5) covering `values`: the first step of
 * `steps` that fits, so the axis reads «1,40 · 1,45 · 1,50» instead of «1,41 · 1,48».
 */
export function niceScale(values: number[], steps: readonly number[]): { domain: [number, number]; ticks: number[] } {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const fit = (step: number) => {
    let lo = Math.floor(min / step) * step;
    let hi = Math.ceil(max / step) * step;
    if (hi - lo < step) {
      lo -= step;
      hi += step;
    }
    return { lo, hi, count: Math.round((hi - lo) / step) };
  };
  const step = steps.find((candidate) => fit(candidate).count <= 4) ?? steps[steps.length - 1];
  const { lo, hi, count } = fit(step);
  const ticks = Array.from({ length: count + 1 }, (_, index) => Math.round((lo + index * step) * 1e6) / 1e6);
  return { domain: [lo, hi], ticks };
}

const SECOND_STEPS = [1, 2, 5, 10, 15, 30, 60] as const;
const INDEX_STEPS = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1] as const;

function ChartFrame({
  title,
  summary,
  height = 180,
  children,
}: {
  title?: string;
  summary: string;
  height?: number;
  children: ReactElement;
}) {
  return (
    <div>
      {title ? <p className="mb-2 text-xs font-semibold text-muted-foreground">{title}</p> : null}
      <div role="img" aria-label={summary} style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

type LegendItem = { label: string; color: string; shape: "line" | "dash" | "box" | "outline"; faded?: boolean };

/** Legend as text with a swatch beside it (the text never takes the series colour). */
export function ChartLegend({ items, className }: { items: LegendItem[]; className?: string }) {
  return (
    <ul className={cn("mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground", className)}>
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className={cn(
              "shrink-0",
              item.shape === "box" && "size-2.5 rounded-sm",
              item.shape === "line" && "h-0.5 w-3.5 rounded-full",
              item.shape === "dash" && "w-3.5 border-t-2 border-dashed",
              item.shape === "outline" && "size-2.5 rounded-sm border border-dashed"
            )}
            style={
              item.shape === "dash" || item.shape === "outline"
                ? { borderColor: item.color }
                : { background: item.color, opacity: item.faded ? 0.4 : 1 }
            }
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

// ─── Passo soglia ───────────────────────────────────────────────────────────

/** Month-end CSS of the last 6 months; nothing when no month has an estimate. */
export function CssHistoryChart({ history }: { history: SwimMetrics["css"]["history"] }) {
  if (!history.some((entry) => entry.paceSecondsPer100 !== null)) return null;
  const data = history.map((entry) => ({ month: entry.month, pace: entry.paceSecondsPer100 }));
  const paces = history.flatMap((entry) => (entry.paceSecondsPer100 === null ? [] : [entry.paceSecondsPer100]));
  const scale = niceScale([Math.min(...paces) - 1, Math.max(...paces) + 1], SECOND_STEPS);
  return (
    <ChartFrame title="Stima a fine mese (/100 m)" summary={cssChartSummary(history)}>
      <LineChart data={data} margin={MARGIN}>
        {GRID}
        <XAxis dataKey="month" {...X_AXIS} interval={0} tickFormatter={(month) => formatMonthKey(String(month))} />
        <YAxis
          {...Y_AXIS}
          domain={scale.domain}
          ticks={scale.ticks}
          interval={0}
          tickFormatter={(value: number) => formatPaceValue(value)}
        />
        <Tooltip
          {...TOOLTIP}
          cursor={LINE_CURSOR}
          labelFormatter={(month) => formatMonthKey(String(month), "long")}
          formatter={(value) => [`${formatPaceValue(Number(value))} /100 m`, "Passo soglia"]}
        />
        <Line
          dataKey="pace"
          name="Passo soglia"
          stroke="var(--chart-2)"
          strokeWidth={2}
          dot={dot("var(--chart-2)")}
          connectNulls={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ChartFrame>
  );
}

// ─── Forma e fatica ─────────────────────────────────────────────────────────

const LOAD_NAMES: Record<string, string> = { forma: "Forma", fatica: "Fatica", equilibrio: "Equilibrio" };

export type LoadDatum = {
  date: string;
  forma: number;
  fatica: number;
  equilibrio: number;
  stss: number;
  sessions: SessionMetrics[];
};

/** «1:49 /100 m (stima)»: the CSS a swim's load uses. */
const cssUsedLabel = (session: SessionMetrics) =>
  session.cssPaceSecondsPer100 == null
    ? null
    : `${formatPaceValue(session.cssPaceSecondsPer100)} /100 m (${session.cssSource === "test" ? "test" : "stima"})`;

/** Tooltip of a day of the load chart: the balance read with the shared bands, the day's load and CSS. */
export const LoadTooltipContent = detailTooltip<LoadDatum>((day) => {
  const rows: TooltipRow[] = [
    { label: "Forma", value: formatInteger(day.forma) },
    { label: "Fatica", value: formatInteger(day.fatica) },
    {
      label: "Equilibrio",
      value: `${formatSignedInteger(day.equilibrio)} · ${TSB_READING_LABELS[tsbReadingOf(day.equilibrio)]}`,
    },
  ];
  if (day.stss > 0) {
    const estimated = day.sessions.some((session) => session.loadEstimated);
    rows.push({ label: "Carico del giorno", value: `${formatInteger(day.stss)}${estimated ? " (stimato)" : ""}` });
    const cssUsed = Array.from(new Set(day.sessions.map(cssUsedLabel).filter((label) => label !== null)));
    if (cssUsed.length > 0) rows.push({ label: "Passo soglia usato", value: cssUsed.join(", ") });
  }
  return { title: dayLabel(day.date), rows };
});

/** Form and fatigue (lines) and their balance (bars) over the last 90 days, one axis in points. */
export function LoadChart({ load, sessions }: { load: SwimMetrics["load"]; sessions: SessionMetrics[] }) {
  const summary = loadChartSummary(load);
  if (!summary) return null;
  const data: LoadDatum[] = load.days.map((day) => ({
    date: day.date,
    forma: day.ctl,
    fatica: day.atl,
    equilibrio: day.tsb,
    stss: day.stss,
    sessions: sessions.filter((session) => session.date === day.date && session.stss !== null),
  }));
  return (
    <div>
      <ChartFrame title="Ultimi 90 giorni (punti di carico)" summary={summary} height={200}>
        <ComposedChart data={data} margin={MARGIN} barCategoryGap={0}>
          {GRID}
          <XAxis dataKey="date" {...X_AXIS} minTickGap={24} tickFormatter={dayLabel} />
          <YAxis {...Y_AXIS} width={32} allowDecimals={false} />
          <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.6} />
          <Tooltip cursor={LINE_CURSOR} isAnimationActive={false} content={LoadTooltipContent} />
          <Bar
            dataKey="equilibrio"
            name={LOAD_NAMES.equilibrio}
            fill="var(--muted-foreground)"
            fillOpacity={0.35}
            isAnimationActive={false}
          />
          <Line
            dataKey="forma"
            name={LOAD_NAMES.forma}
            stroke="var(--chart-2)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            dataKey="fatica"
            name={LOAD_NAMES.fatica}
            stroke="var(--chart-1)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ChartFrame>
      <ChartLegend
        items={[
          { label: "Forma (42 giorni)", color: "var(--chart-2)", shape: "line" },
          { label: "Fatica (7 giorni)", color: "var(--chart-1)", shape: "line" },
          { label: "Equilibrio", color: "var(--muted-foreground)", shape: "box", faded: true },
        ]}
      />
    </div>
  );
}

// ─── Intensità ──────────────────────────────────────────────────────────────

const UNCLASSIFIED_NAME = "Non classificati (altri stili, tecnica, gambe)";

/** Legend of the weekly bars: the seven zones A1–C3 or the five levels, with their fills. */
export const zoneLegendItems = (view: ZoneView): LegendItem[] =>
  zoneShareItems(emptyZones7(), view).map((item) => ({ label: item.label, color: item.color, shape: "box" }));

/**
 * Weekly km per pace zone A1–C3 (or per level), stacked cool to warm, over the last 8 weeks; the
 * metres not zoned (other strokes, drill, kick) on top as an empty dashed segment (a grey fill
 * reads like a zone), so the bar is the whole pool volume with laps.
 */
export function IntensityChart({ weeks, view }: { weeks: SwimMetrics["intensity"]["weeks"]; view: ZoneView }) {
  const hasUnclassified = weeks.some((week) => (week.unclassifiedMeters ?? 0) > 0);
  if (!hasUnclassified && !weeks.some((week) => week.zoneMeters.some((meters) => meters > 0))) return null;
  const series = zoneShareItems(emptyZones7(), view);
  const data = weeks.map((week) => ({
    week: week.weekStart,
    ...Object.fromEntries(zoneShareItems(week.zoneMeters, view).map((item) => [item.key, item.meters / 1000])),
    altro: (week.unclassifiedMeters ?? 0) / 1000,
  }));
  return (
    <div>
      <ChartFrame
        title={view === "zone" ? "Km per zona, ultime 8 settimane" : "Km per livello, ultime 8 settimane"}
        summary={intensityChartSummary(weeks, view)}
      >
        <BarChart data={data} margin={MARGIN}>
          {GRID}
          <XAxis dataKey="week" {...X_AXIS} tickFormatter={dayLabel} />
          <YAxis
            {...Y_AXIS}
            width={32}
            allowDecimals={false}
            tickFormatter={(value: number) => formatKm(value * 1000)}
          />
          <Tooltip
            {...TOOLTIP}
            cursor={BAR_CURSOR}
            labelFormatter={(week) => `Settimana del ${dayLabel(week)}`}
            formatter={(value, name) => [`${formatKm(Number(value) * 1000)} km`, String(name)]}
          />
          {series.map((item) => (
            <Bar
              key={item.key}
              dataKey={item.key}
              stackId="zone"
              name={item.label}
              fill={item.color}
              // 1px surface gap between the stacked segments.
              stroke="var(--card)"
              strokeWidth={1}
              maxBarSize={24}
              isAnimationActive={false}
            />
          ))}
          {hasUnclassified ? (
            <Bar
              dataKey="altro"
              stackId="zone"
              name={UNCLASSIFIED_NAME}
              fill="transparent"
              stroke="var(--muted-foreground)"
              strokeDasharray="3 2"
              strokeWidth={1}
              maxBarSize={24}
              isAnimationActive={false}
            />
          ) : null}
        </BarChart>
      </ChartFrame>
      <ChartLegend
        items={[
          ...zoneLegendItems(view),
          ...(hasUnclassified
            ? [{ label: UNCLASSIFIED_NAME, color: "var(--muted-foreground)", shape: "outline" as const }]
            : []),
        ]}
      />
    </div>
  );
}

// ─── Efficienza ─────────────────────────────────────────────────────────────

/** Stroke Index per swim in the pool length of the summary, with the personal baseline dashed. */
export function EfficiencyChart({ metrics }: { metrics: SwimMetrics }) {
  const summary = efficiencyChartSummary(metrics);
  if (!summary) return null;
  const baseline = metrics.efficiency.baseline;
  const data = efficiencySessions(metrics).map((session) => ({ date: session.date, si: session.strokeIndex }));
  const values = [...data.map((point) => point.si), ...(baseline === null ? [] : [baseline])];
  const scale = niceScale([Math.min(...values) - 0.01, Math.max(...values) + 0.01], INDEX_STEPS);
  return (
    <div>
      <ChartFrame title="Stroke Index per nuotata" summary={summary}>
        <LineChart data={data} margin={MARGIN}>
          {GRID}
          <XAxis dataKey="date" {...X_AXIS} tickFormatter={dayLabel} />
          <YAxis
            {...Y_AXIS}
            domain={scale.domain}
            ticks={scale.ticks}
            interval={0}
            tickFormatter={(value: number) => formatDecimal(value, 2)}
          />
          {baseline !== null ? (
            <ReferenceLine
              y={baseline}
              stroke="var(--muted-foreground)"
              strokeDasharray="4 4"
            />
          ) : null}
          <Tooltip
            {...TOOLTIP}
            cursor={LINE_CURSOR}
            labelFormatter={dayLabel}
            formatter={(value) => [formatDecimal(Number(value), 2), "Stroke Index"]}
          />
          <Line
            dataKey="si"
            name="Stroke Index"
            stroke="var(--chart-2)"
            strokeWidth={2}
            dot={dot("var(--chart-2)")}
            isAnimationActive={false}
          />
        </LineChart>
      </ChartFrame>
      {baseline !== null ? (
        <ChartLegend
          items={[
            { label: "Stroke Index", color: "var(--chart-2)", shape: "line" },
            { label: "La tua base", color: "var(--muted-foreground)", shape: "dash" },
          ]}
        />
      ) : null}
    </div>
  );
}

// ─── Regolarità e tenuta nelle ripetute ─────────────────────────────────────

/** Times of the most recent set; the axis starts near the fastest rep so differences show. */
export function PacingSetChart({ set }: { set: NonNullable<SwimMetrics["pacing"]["latestSet"]> }) {
  const data = set.repSeconds.map((seconds, index) => ({ rep: index + 1, seconds }));
  const min = Math.min(...set.repSeconds);
  const max = Math.max(...set.repSeconds);
  // Room under the fastest rep, so even it has a visible bar.
  const scale = niceScale([Math.max(0, min - Math.max(max - min, 2) - 1), max], SECOND_STEPS);
  return (
    <ChartFrame
      title={`Ultima serie · ${formatKeyDayMonth(set.date)} · ${setTitle(set)}`}
      summary={pacingSetSummary(set)}
    >
      <BarChart data={data} margin={MARGIN}>
        {GRID}
        <XAxis dataKey="rep" {...X_AXIS} />
        <YAxis
          {...Y_AXIS}
          domain={scale.domain}
          ticks={scale.ticks}
          interval={0}
          allowDataOverflow
          tickFormatter={(value: number) => formatClock(value)}
        />
        <Tooltip
          {...TOOLTIP}
          cursor={BAR_CURSOR}
          labelFormatter={(rep) => `Ripetuta ${rep}`}
          formatter={(value) => [formatClock(Number(value)), "Tempo"]}
        />
        <Bar
          dataKey="seconds"
          name="Tempo"
          fill="var(--chart-1)"
          radius={[4, 4, 0, 0]}
          maxBarSize={24}
          isAnimationActive={false}
        />
      </BarChart>
    </ChartFrame>
  );
}

const DPS_STEPS = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5] as const;

/**
 * Distance per cycle of each rep of the same set, under the times: a separate small chart with
 * its own axis (one axis per chart reads better at 360 px than a second axis on the bars).
 */
export function PacingDpsChart({ set }: { set: NonNullable<SwimMetrics["pacing"]["latestSet"]> }) {
  const summary = pacingDpsSummary(set);
  if (!summary || !set.repDps) return null;
  const data = set.repDps.map((dps, index) => ({ rep: index + 1, dps }));
  const scale = niceScale([Math.min(...set.repDps) - 0.01, Math.max(...set.repDps) + 0.01], DPS_STEPS);
  return (
    <ChartFrame title="Distanza per bracciata per ripetuta (m)" summary={summary} height={130}>
      <LineChart data={data} margin={MARGIN}>
        {GRID}
        {/* Reps on a number axis from 0,5 to n + 0,5: each point and its tick sit over the middle
            of the rep's bar in the chart above. */}
        <XAxis
          dataKey="rep"
          {...X_AXIS}
          type="number"
          domain={[0.5, data.length + 0.5]}
          ticks={data.map((point) => point.rep)}
          interval={0}
        />
        <YAxis
          {...Y_AXIS}
          domain={scale.domain}
          ticks={scale.ticks}
          interval={0}
          tickFormatter={(value: number) => formatDecimal(value, 2)}
        />
        <Tooltip
          {...TOOLTIP}
          cursor={LINE_CURSOR}
          labelFormatter={(rep) => `Ripetuta ${rep}`}
          formatter={(value) => [`${formatDecimal(Number(value), 2)} m`, "Distanza per bracciata"]}
        />
        <Line
          dataKey="dps"
          name="Distanza per bracciata"
          stroke="var(--chart-2)"
          strokeWidth={2}
          dot={dot("var(--chart-2)")}
          isAnimationActive={false}
        />
      </LineChart>
    </ChartFrame>
  );
}

/** Tooltip of a swim of the variability chart, with its fade and stroke holding. */
export const PacingTooltipContent = detailTooltip<SessionMetrics & { pacingCv: number }>((session) => {
  const rows: TooltipRow[] = [{ label: "Variabilità", value: `${formatDecimal(session.pacingCv, 1)}%` }];
  if (session.pacingFade !== null) rows.push({ label: "Calo nel finale", value: signedPct(session.pacingFade) });
  if (session.dpsDropPct != null) {
    rows.push({ label: "Bracciata nel finale", value: signedPct(-session.dpsDropPct) });
  }
  if (session.strokeRateRisePct != null) {
    rows.push({ label: "Frequenza nel finale", value: signedPct(session.strokeRateRisePct) });
  }
  return { title: dayLabel(session.date), rows };
});

/** Pace variability (CV) of each swim with repeat sets, last 90 days. */
export function PacingCvChart({ metrics }: { metrics: SwimMetrics }) {
  const summary = pacingCvSummary(metrics);
  if (!summary) return null;
  const data = pacingSessions(metrics);
  return (
    <ChartFrame title="Variabilità per nuotata (%)" summary={summary}>
      <LineChart data={data} margin={MARGIN}>
        {GRID}
        <XAxis dataKey="date" {...X_AXIS} tickFormatter={dayLabel} />
        <YAxis
          {...Y_AXIS}
          width={32}
          domain={[0, "dataMax + 1"]}
          allowDecimals={false}
          tickFormatter={(value: number) => formatInteger(value)}
        />
        <Tooltip cursor={LINE_CURSOR} isAnimationActive={false} content={PacingTooltipContent} />
        <Line
          dataKey="pacingCv"
          name="Variabilità"
          stroke="var(--chart-2)"
          strokeWidth={2}
          dot={dot("var(--chart-2)")}
          isAnimationActive={false}
        />
      </LineChart>
    </ChartFrame>
  );
}

// ─── Volume ─────────────────────────────────────────────────────────────────

/** Km per week over 12 weeks; the current week, not over yet, is lighter. */
export function VolumeChart({ volume }: { volume: SwimMetrics["volume"] }) {
  const summary = volumeChartSummary(volume);
  if (!summary) return null;
  const last = volume.weeks.length - 1;
  const data = volume.weeks.map((week, index) => ({
    week: week.weekStart,
    km: week.km,
    sessions: week.sessions,
    current: index === last,
  }));
  return (
    <div>
      <ChartFrame title="Km per settimana" summary={summary}>
        <BarChart data={data} margin={MARGIN}>
          {GRID}
          <XAxis dataKey="week" {...X_AXIS} tickFormatter={dayLabel} />
          <YAxis
            {...Y_AXIS}
            width={32}
            allowDecimals={false}
            tickFormatter={(value: number) => formatKm(value * 1000)}
          />
          <Tooltip
            {...TOOLTIP}
            cursor={BAR_CURSOR}
            labelFormatter={(week) => `Settimana del ${dayLabel(week)}`}
            formatter={(value, _name, item) => [
              `${formatKm(Number(value) * 1000)} km · ${formatSwims(Number(item?.payload?.sessions ?? 0))}`,
              "Volume",
            ]}
          />
          <Bar dataKey="km" name="Volume" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false}>
            {data.map((week) => (
              <Cell key={week.week} fill="var(--chart-1)" fillOpacity={week.current ? 0.4 : 1} />
            ))}
          </Bar>
        </BarChart>
      </ChartFrame>
      <ChartLegend
        items={[
          { label: "Settimane complete", color: "var(--chart-1)", shape: "box" },
          { label: "Settimana in corso", color: "var(--chart-1)", shape: "box", faded: true },
        ]}
      />
    </div>
  );
}
