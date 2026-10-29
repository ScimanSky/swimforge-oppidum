import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type ChipTone = "neutral" | "action" | "xp" | "success";
const TONE: Record<ChipTone, string> = {
  neutral: "bg-raised text-foreground",
  action: "bg-primary/15 text-action-text",
  xp: "bg-xp/15 text-xp",
  success: "bg-success/15 text-success",
};

/** Corsia chip: 28px pill, 12px semibold label, one tone per meaning. */
export function Chip({
  tone = "neutral",
  className,
  children,
}: {
  tone?: ChipTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-3 text-xs font-semibold",
        TONE[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
