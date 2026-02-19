import { cn } from "@/lib/utils"

interface SwimForgeMarkProps {
  className?: string
  alt?: string
}

export function SwimForgeMark({ className, alt = "SwimForge" }: SwimForgeMarkProps) {
  return (
    <img
      src="/images/theme-v3/logo-cyber.webp"
      alt={alt}
      className={cn("h-10 w-10 object-contain drop-shadow-md", className)}
      loading="eager"
      decoding="async"
    />
  )
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
