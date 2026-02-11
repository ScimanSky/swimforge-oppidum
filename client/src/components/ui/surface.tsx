import * as React from "react"

import { cn } from "@/lib/utils"

function Surface({ className, ...props }: React.ComponentProps<"section">) {
  return <section data-slot="surface" className={cn("surface-panel p-6", className)} {...props} />
}

function SurfaceHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="surface-header" className={cn("space-y-1.5", className)} {...props} />
}

function SurfaceTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return (
    <h3
      data-slot="surface-title"
      className={cn("text-base font-display font-semibold text-foreground", className)}
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
  return <div data-slot="surface-content" className={cn("space-y-4", className)} {...props} />
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
