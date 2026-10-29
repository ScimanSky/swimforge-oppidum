import type { ReactNode } from "react";
import { Link } from "wouter";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { NO_VALUE, getInitials } from "@/lib/format";
import { cn } from "@/lib/utils";

const PODIUM = { 1: "rank-gold", 2: "rank-silver", 3: "rank-bronze" } as const;

/**
 * Position in a ranking: gold, silver and bronze pills for the podium, a plain number after, «—»
 * for an entry without a result (no position, no medal).
 */
export function RankBadge({ rank, className }: { rank: number | null; className?: string }) {
  const variant = rank === null ? undefined : PODIUM[rank as keyof typeof PODIUM];
  if (!variant) {
    return (
      <span
        className={cn(
          "inline-flex size-8 shrink-0 items-center justify-center text-sm font-bold text-muted-foreground tabular-nums",
          className
        )}
      >
        {rank === null ? (
          <>
            <span aria-hidden>{NO_VALUE}</span>
            <span className="sr-only">Senza posizione</span>
          </>
        ) : (
          rank
        )}
      </span>
    );
  }
  return (
    <Badge variant={variant} className={cn("size-8 shrink-0 p-0 text-sm tabular-nums", className)}>
      {rank}
    </Badge>
  );
}

/** Barlow number with its unit underneath («1.234» / «XP»), right aligned. */
export function RankValue({ value, unit }: { value: string; unit?: string }) {
  return (
    <span className="shrink-0 text-right">
      <span className="block font-display text-[22px] font-bold leading-none tabular-nums">
        {value}
      </span>{" "}
      {unit ? <span className="mt-1 block text-xs text-muted-foreground">{unit}</span> : null}
    </span>
  );
}

export type RankRowProps = {
  /** null: no result yet, so no position. */
  rank: number | null;
  name: string;
  avatarUrl?: string | null;
  subtitle?: ReactNode;
  value: string;
  unit?: string;
  /** Profile link; without it the row is not interactive. */
  href?: string;
  isCurrentUser?: boolean;
  /** Small extra next to the avatar (e.g. the profile badge). */
  extra?: ReactNode;
};

/** One ranking row: position, avatar, name, value; the signed-in swimmer is highlighted. */
export function RankRow({
  rank,
  name,
  avatarUrl,
  subtitle,
  value,
  unit,
  href,
  isCurrentUser = false,
  extra,
}: RankRowProps) {
  const className = cn(
    "flex min-h-16 items-center gap-3 rounded-2xl border p-3 transition-colors",
    isCurrentUser ? "border-action-text bg-raised" : "border-border bg-card",
    href && !isCurrentUser && "hover:bg-raised"
  );
  const content = (
    <>
      <RankBadge rank={rank} />
      <Avatar className="size-10">
        <AvatarImage src={avatarUrl || undefined} alt="" className="object-cover" />
        <AvatarFallback className="bg-raised text-xs font-semibold">{getInitials(name)}</AvatarFallback>
      </Avatar>
      {extra}
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate font-semibold text-foreground">{name}</span>
          {isCurrentUser ? (
            <span className="shrink-0 text-xs font-semibold text-action-text">Tu</span>
          ) : null}
        </span>
        {subtitle ? (
          <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
        ) : null}
      </span>{" "}
      <RankValue value={value} unit={unit} />
    </>
  );
  return href ? (
    <Link href={href} className={className}>
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );
}
