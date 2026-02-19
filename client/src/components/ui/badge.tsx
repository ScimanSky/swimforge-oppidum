import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90',
        secondary:
          'border-transparent bg-secondary text-secondary-foreground flex-none',
        destructive:
          'border-transparent bg-destructive text-white [a&]:hover:bg-destructive/90',
        neon:
          'border-[1.5px] border-primary bg-primary/20 text-primary shadow-[0_0_20px_var(--neon-soft)] font-extrabold tracking-widest uppercase text-[0.65rem] px-2.5 py-1',
        'rank-gold':
          'border-[1.5px] border-[var(--gold)] bg-[var(--gold)]/20 text-[var(--gold)] font-extrabold tracking-widest uppercase text-[0.65rem] px-2.5 py-1 shadow-[0_0_16px_color-mix(in_oklch,var(--gold)_40%,transparent)]',
        'rank-silver':
          'border-[1.5px] border-slate-300 bg-slate-300/20 text-slate-200 font-extrabold tracking-widest uppercase text-[0.65rem] px-2.5 py-1 shell-text-shadow',
        'rank-bronze':
          'border-[1.5px] border-orange-500 bg-orange-500/20 text-orange-400 font-extrabold tracking-widest uppercase text-[0.65rem] px-2.5 py-1 shell-text-shadow',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<'span'> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'span'

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
