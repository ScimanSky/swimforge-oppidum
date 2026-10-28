import { Link } from "wouter";
import { cn } from "@/lib/utils";

export type LevelCardProps = {
  level: number;
  totalXp: number;
  nextLevelXp: number | null;
  xpToNextLevel: number;
};

// "always": Italian CLDR skips the separator on 4-digit numbers (8420); Corsia shows «8.420».
const nf = new Intl.NumberFormat("it-IT", { useGrouping: "always" });
const progressPercent = (totalXp: number, nextLevelXp: number | null) =>
  nextLevelXp && nextLevelXp > 0
    ? Math.max(0, Math.min(100, (totalXp / nextLevelXp) * 100))
    : 100;

function Bar({ percent, className }: { percent: number; className?: string }) {
  return (
    <div
      className={cn("h-2 w-full overflow-hidden rounded-full bg-raised", className)}
      role="progressbar"
      aria-valuenow={Math.round(percent)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full bg-xp"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

/** Profile level card (Corsia «Season» board without season and missions). */
export function LevelCard({
  level,
  totalXp,
  nextLevelXp,
  xpToNextLevel,
}: LevelCardProps) {
  return (
    <section className="surface-panel p-5" aria-label="Livello">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Livello</p>
          <p className="font-display text-[64px] font-bold leading-none tabular-nums">
            {level}
          </p>
        </div>
        {nextLevelXp ? (
          <div className="text-right">
            <p className="font-display text-[34px] font-bold leading-none text-xp tabular-nums">
              {nf.format(xpToNextLevel)} XP
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              al livello {level + 1}
            </p>
          </div>
        ) : null}
      </div>
      <Bar percent={progressPercent(totalXp, nextLevelXp)} className="mt-5" />
      <p className="mt-3 text-sm text-muted-foreground">
        {nf.format(totalXp)} XP totali
      </p>
    </section>
  );
}

/** One-line level strip for the Today screen; links to the profile. */
export function LevelStrip({
  level,
  totalXp,
  nextLevelXp,
  xpToNextLevel,
}: LevelCardProps) {
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
              {nf.format(xpToNextLevel)} XP
            </span>{" "}
            al {level + 1}
          </p>
        ) : null}
      </div>
      <Bar percent={progressPercent(totalXp, nextLevelXp)} className="mt-3" />
    </Link>
  );
}
