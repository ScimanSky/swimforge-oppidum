'use client'

import * as React from 'react'
import * as ProgressPrimitive from '@radix-ui/react-progress'

import { cn } from '@/lib/utils'

function Progress({
  className,
  value,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  // Passed to Radix for aria-valuenow; clamped, since Radix drops a value outside 0-100.
  const percent = Math.min(100, Math.max(0, Number(value) || 0))
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn(
        'bg-muted/70 relative h-2.5 w-full overflow-hidden rounded-full',
        className,
      )}
      value={percent}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className="bg-primary h-full w-full flex-1 transition-all"
        style={{ transform: `translateX(-${100 - percent}%)` }}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
