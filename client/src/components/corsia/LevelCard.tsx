import { useId } from "react";
import { Link } from "wouter";
import { formatInteger } from "@/lib/format";
import { cn } from "@/lib/utils";

export type LevelCardProps = {
  level: number;
  totalXp: number;
  /** XP required to reach the current level (start of the bar). */
  currentLevelXp: number;
  /** XP required for the next level; null at the maximum level. */
  nextLevelXp: number | null;
  xpToNextLevel: number;
  /** The level's title from level_thresholds (the only title), when known. */
  title?: string | null;
};

/** Progress within the current level, 0-100; full when there is no next level. */
const progressPercent = ({
  totalXp,
  currentLevelXp,
  nextLevelXp,
}: LevelCardProps) => {
  if (nextLevelXp === null || nextLevelXp <= currentLevelXp) return 100;
  const percent =
    ((totalXp - currentLevelXp) / (nextLevelXp - currentLevelXp)) * 100;
  return Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0;
};

function Bar({
  props,
  className,
}: {
  props: LevelCardProps;
  className?: string;
}) {
  const percent = progressPercent(props);
  const atMax = !props.nextLevelXp;
  return (
    <div
      className={cn("h-2 w-full overflow-hidden rounded-full bg-raised", className)}
      role="progressbar"
      aria-label={atMax ? "Livello massimo" : `Avanzamento al livello ${props.level + 1}`}
      aria-valuenow={Math.round(percent)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={
        atMax
          ? `${formatInteger(props.totalXp)} XP totali`
          : `${formatInteger(Math.max(0, props.xpToNextLevel))} XP mancanti`
      }
    >
      <div
        className="h-full rounded-full bg-xp"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

/** Profile level card (Corsia «Season» board without season and missions). */
export function LevelCard(props: LevelCardProps) {
  const { level, totalXp, nextLevelXp, xpToNextLevel, title } = props;
  const titleId = useId();
  return (
    <section className="surface-panel p-5" aria-labelledby={titleId}>
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 id={titleId} className="text-sm font-medium text-muted-foreground">
            Livello
          </h2>
          <p className="font-display text-[64px] font-bold leading-none tabular-nums">
            {level}
          </p>
          {title ? <p className="mt-1 text-sm font-semibold">{title}</p> : null}
        </div>
        {nextLevelXp ? (
          <div className="text-right">
            <p className="font-display text-[34px] font-bold leading-none text-xp tabular-nums">
              {formatInteger(Math.max(0, xpToNextLevel))} XP
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              al livello {level + 1}
            </p>
          </div>
        ) : null}
      </div>
      <Bar props={props} className="mt-5" />
      <p className="mt-3 text-sm text-muted-foreground">
        {formatInteger(totalXp)} XP totali
      </p>
      <p className="mt-1 text-xs text-muted-foreground">I livelli contano solo il nuoto.</p>
    </section>
  );
}

/** One-line level strip for the Today screen; links to the profile. */
export function LevelStrip(props: LevelCardProps) {
  const { level, nextLevelXp, xpToNextLevel } = props;
  return (
    <Link
      href="/profile"
      className="surface-panel block p-4 hover:border-action-text/40"
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-semibold">Livello {level}</p>
        {nextLevelXp ? (
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-xp">
              {formatInteger(Math.max(0, xpToNextLevel))} XP
            </span>{" "}
            al {level + 1}
          </p>
        ) : null}
      </div>
      <Bar props={props} className="mt-3" />
    </Link>
  );
}
