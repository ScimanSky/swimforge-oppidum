/**
 * Charts of the «Metriche» cards (Corsia: `--chart-*` and `--zone-*`, no gradients, solid
 * hairline grid, one y axis). Each chart is a `role="img"` with a text summary for screen
 * readers; the legend and the numbers around it stay as text. Mounted only while its card is open.
 */
import type { ReactElement } from "react";
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
} from "recharts";
import type { SwimMetrics } from "@shared/swimMetrics";
import { formatDecimal, formatInteger, formatKm, formatPaceValue, formatSignedInteger } from "@/lib/format";
import {
  cssChartSummary,
  efficiencyChartSummary,
  efficiencySessions,
  formatClock,
  formatKeyDayMonth,
  formatMonthKey,
  formatSwims,
  intensityChartSummary,
  loadChartSummary,
  PACE_ZONE_NAMES,
  pacingCvSummary,
  pacingSessions,
  pacingSetSummary,
  setTitle,
  volumeChartSummary,
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

type LegendItem = { label: string; color: string; shape: "line" | "dash" | "box"; faded?: boolean };

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
              item.shape === "dash" && "w-3.5 border-t-2 border-dashed"
            )}
            style={
              item.shape === "dash"
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
  return (
    <ChartFrame title="Stima a fine mese (/100 m)" summary={cssChartSummary(history)}>
      <LineChart data={data} margin={MARGIN}>
        {GRID}
        <XAxis dataKey="month" {...X_AXIS} interval={0} tickFormatter={(month) => formatMonthKey(String(month))} />
        <YAxis
          {...Y_AXIS}
          domain={["dataMin - 2", "dataMax + 2"]}
          allowDecimals={false}
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

/** Form and fatigue (lines) and their balance (bars) over the last 90 days, one axis in points. */
export function LoadChart({ load }: { load: SwimMetrics["load"] }) {
  const summary = loadChartSummary(load);
  if (!summary) return null;
  const data = load.days.map((day) => ({ date: day.date, forma: day.ctl, fatica: day.atl, equilibrio: day.tsb }));
  return (
    <div>
      <ChartFrame title="Ultimi 90 giorni (punti di carico)" summary={summary} height={200}>
        <ComposedChart data={data} margin={MARGIN} barCategoryGap={1}>
          {GRID}
          <XAxis dataKey="date" {...X_AXIS} minTickGap={24} tickFormatter={dayLabel} />
          <YAxis {...Y_AXIS} width={32} allowDecimals={false} />
          <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.6} />
          <Tooltip
            {...TOOLTIP}
            cursor={LINE_CURSOR}
            labelFormatter={dayLabel}
            formatter={(value, name) => {
              const number = Number(value);
              return [
                name === "Equilibrio" ? formatSignedInteger(number) : formatInteger(number),
                String(name),
              ];
            }}
          />
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

const ZONE_KEYS = ["z1", "z2", "z3", "z4", "z5"] as const;

export const zoneLegendItems = (): LegendItem[] =>
  PACE_ZONE_NAMES.map((name, index) => ({
    label: `Z${index + 1} ${name}`,
    color: `var(--zone-${index + 1})`,
    shape: "box",
  }));

/** Weekly km per pace zone, stacked, over the last 8 weeks. */
export function IntensityChart({ weeks }: { weeks: SwimMetrics["intensity"]["weeks"] }) {
  if (!weeks.some((week) => week.zoneMeters.some((meters) => meters > 0))) return null;
  const data = weeks.map((week) => ({
    week: week.weekStart,
    ...Object.fromEntries(ZONE_KEYS.map((key, index) => [key, week.zoneMeters[index] / 1000])),
  }));
  return (
    <div>
      <ChartFrame title="Km per zona, ultime 8 settimane" summary={intensityChartSummary(weeks)}>
        <BarChart data={data} margin={MARGIN}>
          {GRID}
          <XAxis dataKey="week" {...X_AXIS} tickFormatter={dayLabel} />
          <YAxis {...Y_AXIS} width={32} tickFormatter={(value: number) => formatKm(value * 1000)} />
          <Tooltip
            {...TOOLTIP}
            cursor={BAR_CURSOR}
            labelFormatter={(week) => `Settimana del ${dayLabel(week)}`}
            formatter={(value, name) => [`${formatKm(Number(value) * 1000)} km`, String(name)]}
          />
          {ZONE_KEYS.map((key, index) => (
            <Bar
              key={key}
              dataKey={key}
              stackId="zone"
              name={`Z${index + 1} ${PACE_ZONE_NAMES[index]}`}
              fill={`var(--zone-${index + 1})`}
              // 1px surface gap between the stacked segments.
              stroke="var(--card)"
              strokeWidth={1}
              maxBarSize={24}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ChartFrame>
      <ChartLegend items={zoneLegendItems()} />
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
  return (
    <div>
      <ChartFrame title="Stroke Index per nuotata" summary={summary}>
        <LineChart data={data} margin={MARGIN}>
          {GRID}
          <XAxis dataKey="date" {...X_AXIS} tickFormatter={dayLabel} />
          <YAxis
            {...Y_AXIS}
            domain={["dataMin - 0.05", "dataMax + 0.05"]}
            tickFormatter={(value: number) => formatDecimal(value, 2)}
          />
          {baseline !== null ? (
            <ReferenceLine
              y={baseline}
              stroke="var(--muted-foreground)"
              strokeDasharray="4 4"
              ifOverflow="extendDomain"
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

// ─── Regolarità nelle ripetute ──────────────────────────────────────────────

/** Times of the most recent set; the axis starts near the fastest rep so differences show. */
export function PacingSetChart({ set }: { set: NonNullable<SwimMetrics["pacing"]["latestSet"]> }) {
  const data = set.repSeconds.map((seconds, index) => ({ rep: index + 1, seconds }));
  const min = Math.min(...set.repSeconds);
  const max = Math.max(...set.repSeconds);
  const floor = Math.max(0, Math.floor(min - Math.max(max - min, 2) - 1));
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
          domain={[floor, Math.ceil(max + 1)]}
          allowDataOverflow
          allowDecimals={false}
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

/** Pace variability (CV) of each swim with repeat sets, last 90 days. */
export function PacingCvChart({ metrics }: { metrics: SwimMetrics }) {
  const summary = pacingCvSummary(metrics);
  if (!summary) return null;
  const data = pacingSessions(metrics).map((session) => ({ date: session.date, cv: session.pacingCv }));
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
        <Tooltip
          {...TOOLTIP}
          cursor={LINE_CURSOR}
          labelFormatter={dayLabel}
          formatter={(value) => [`${formatDecimal(Number(value), 1)}%`, "Variabilità"]}
        />
        <Line
          dataKey="cv"
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
