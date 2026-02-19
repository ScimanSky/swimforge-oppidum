import { cn } from "@/lib/utils"

interface SwimForgeMarkProps {
  className?: string
  alt?: string
}

export function SwimForgeMark({ className, alt = "SwimForge" }: SwimForgeMarkProps) {
  return null;
}

interface SwimForgeWordmarkProps {
  className?: string
  compact?: boolean
}

export function SwimForgeWordmark({ className, compact = false }: SwimForgeWordmarkProps) {
  return (
    <span
      className={cn(
        "sf-wordmark font-display font-semibold tracking-[0.08em] text-foreground",
        compact ? "text-base" : "text-xl",
        className,
      )}
    >
      SwimForge
    </span>
  )
}
