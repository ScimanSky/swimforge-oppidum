import * as React from 'react'

import { cn } from '@/lib/utils'

function Card({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card"
      className={cn(
        [
          'group/card relative isolate overflow-hidden rounded-[28px] py-6',
          'text-card-foreground flex flex-col gap-6',
          // De-emphasize rigid card rectangles: softer surface + lighter edge.
          '!border !border-[color-mix(in_oklch,var(--border)_52%,transparent)]',
          '!bg-[linear-gradient(150deg,color-mix(in_oklch,var(--card)_52%,transparent),color-mix(in_oklch,var(--card)_34%,transparent))]',
          'backdrop-blur-2xl',
          // Slightly cut corners to avoid strict box feel.
          '[clip-path:polygon(0_12px,12px_0,calc(100%-12px)_0,100%_12px,100%_calc(100%-12px),calc(100%-12px)_100%,12px_100%,0_calc(100%-12px))]',
          // Interactive lift (subtle).
          'transition-[transform,box-shadow,border-color] duration-200 will-change-transform',
          'shadow-[0_14px_40px_color-mix(in_oklch,var(--foreground)_10%,transparent)]',
          'hover:-translate-y-0.5 hover:!border-[color-mix(in_oklch,var(--electric-cyan)_24%,transparent)]',
          'hover:shadow-[0_22px_62px_color-mix(in_oklch,var(--foreground)_14%,transparent),0_0_32px_var(--neon-soft)]',
          // Ambient highlight overlay.
          "before:pointer-events-none before:absolute before:inset-0 before:content-['']",
          'before:bg-[radial-gradient(90%_70%_at_18%_0%,color-mix(in_oklch,var(--electric-cyan)_20%,transparent)_0%,transparent_66%)]',
          'before:opacity-60 hover:before:opacity-85 before:transition-opacity before:duration-300',
          // Fine inner veil to make cards blend more into page background.
          "after:pointer-events-none after:absolute after:inset-0 after:content-['']",
          'after:bg-[linear-gradient(180deg,color-mix(in_oklch,white_6%,transparent),transparent_26%,color-mix(in_oklch,black_12%,transparent))]',
          'after:opacity-45',
        ].join(' '),
        className,
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        '@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6',
        className,
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-title"
      className={cn('leading-none font-semibold', className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-description"
      className={cn('text-muted-foreground text-sm', className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        'col-start-2 row-span-2 row-start-1 self-start justify-self-end',
        className,
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-content"
      className={cn('px-6', className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-footer"
      className={cn('flex items-center px-6 [.border-t]:pt-6', className)}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
