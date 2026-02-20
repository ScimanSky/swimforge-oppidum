"use client"

import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface UploadStatusPillProps {
  label: string
  className?: string
}

export function UploadStatusPill({ label, className }: UploadStatusPillProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-[var(--electric-cyan)]/40 bg-card/70 px-2.5 py-1 text-[11px] font-medium text-[var(--electric-cyan)]",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <Loader2 className="size-3 animate-spin" />
      <span>{label}</span>
    </div>
  )
}
