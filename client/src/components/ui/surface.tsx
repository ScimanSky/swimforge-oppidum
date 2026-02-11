import * as React from "react"

import { cn } from "@/lib/utils"

function Surface({ className, ...props }: React.ComponentProps<"section">) {
  return (
    <section
      data-slot="surface"
      className={cn(
        "surface-panel relative isolate p-4 sm:p-5 lg:p-6 transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-px",
        className
      )}
      {...props}
    />
  )
}

function SurfaceHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="surface-header"
      className={cn("flex items-start justify-between gap-3", className)}
      {...props}
    />
  )
}

function SurfaceTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return (
    <h3
      data-slot="surface-title"
      className={cn("text-base font-display font-semibold tracking-tight text-foreground", className)}
      {...props}
    />
  )
}

function SurfaceDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="surface-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function SurfaceAction({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="surface-action" className={cn("shrink-0", className)} {...props} />
}

function SurfaceContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="surface-content" className={cn("min-w-0 space-y-4", className)} {...props} />
}

function SurfaceFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="surface-footer" className={cn("flex items-center gap-2", className)} {...props} />
}

export {
  Surface,
  SurfaceHeader,
  SurfaceFooter,
  SurfaceTitle,
  SurfaceAction,
  SurfaceDescription,
  SurfaceContent,
}
