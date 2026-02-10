import * as React from 'react'

import { cn } from '@/lib/utils'

function Card({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card"
      className={cn(
        [
          'group/card relative isolate overflow-hidden rounded-2xl py-6',
          'text-card-foreground flex flex-col gap-6',
          // Decisive surface + gradient border
          'ei-border-gradient backdrop-blur-xl',
          // Interactive lift
          'transition-[transform,box-shadow] duration-200 will-change-transform',
          'hover:-translate-y-1 hover:shadow-[0_28px_90px_color-mix(in_oklch,var(--foreground)_18%,transparent),0_0_0_1px_color-mix(in_oklch,var(--electric-cyan)_28%,transparent),0_0_46px_var(--neon-soft)]',
          // Subtle highlight overlay
          "before:pointer-events-none before:absolute before:inset-0 before:content-['']",
          'before:bg-[radial-gradient(90%_70%_at_20%_0%,color-mix(in_oklch,var(--electric-cyan)_32%,transparent)_0%,transparent_65%)]',
          'before:opacity-70 hover:before:opacity-100 before:transition-opacity before:duration-300',
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
