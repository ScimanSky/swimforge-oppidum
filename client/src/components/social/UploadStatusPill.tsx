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
        "inline-flex h-7 items-center gap-1.5 rounded-full bg-primary/15 px-3 text-xs font-semibold text-action-text",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <Loader2 className="size-3.5 animate-spin" aria-hidden />
      <span>{label}</span>
    </div>
  )
}
