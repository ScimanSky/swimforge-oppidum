import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-[transform,background-color,border-color,color,box-shadow] duration-200 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow-[0_0_22px_var(--neon-soft)] hover:shadow-[0_0_40px_var(--neon-glow)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]',
        neon:
          [
            'relative overflow-hidden',
            // Stark solid cyber gradient
            'bg-[linear-gradient(135deg,var(--electric-cyan),var(--electric-lime))]',
            'bg-[length:220%_220%] bg-[position:0%_50%] hover:bg-[position:100%_50%]',
            'text-primary-foreground font-extrabold tracking-widest uppercase text-xs',
            'shadow-[0_0_24px_var(--neon-soft),0_0_48px_var(--neon-soft)] hover:shadow-[0_0_40px_var(--neon-glow),0_0_80px_var(--neon-soft)]',
            'border-[1.5px] border-primary-foreground/30 hover:border-primary-foreground/60',
            'hover:-translate-y-[2px] active:translate-y-0 active:scale-[0.98]',
            "before:pointer-events-none before:absolute before:inset-0 before:content-['']",
            'before:bg-[radial-gradient(circle_at_30%_20%,color-mix(in_oklch,white_40%,transparent)_0%,transparent_60%)]',
            'before:opacity-40 hover:before:opacity-100 before:transition-opacity before:duration-200',
            "after:pointer-events-none after:absolute after:inset-0 after:content-['']",
            'after:bg-[linear-gradient(90deg,transparent,color-mix(in_oklch,white_60%,transparent),transparent)]',
            'after:translate-x-[-150%] hover:after:translate-x-[150%] after:transition-transform after:duration-[600ms] after:ease-out',
          ].join(' '),
        'outline-neon':
          [
            'border-2 border-primary bg-background/50',
            'text-primary font-bold tracking-widest uppercase text-xs hover:text-primary-foreground hover:bg-primary',
            'shadow-[0_0_12px_var(--neon-soft),inset_0_0_12px_var(--neon-soft)] hover:shadow-[0_0_30px_var(--neon-glow)]',
            'hover:-translate-y-[2px] active:translate-y-0 active:scale-[0.98]',
            'transition-all duration-300'
          ].join(' '),
        'ghost-neon':
          'text-primary font-bold tracking-widest uppercase text-xs hover:bg-primary/20 hover:shadow-[0_0_20px_var(--neon-soft)] hover:text-primary',
        destructive:
          'bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60',
        outline:
          'border border-border/60 bg-background/40 shadow-sm hover:bg-accent/20 hover:text-accent-foreground backdrop-blur-md',
        secondary:
          'bg-secondary/80 text-secondary-foreground hover:bg-secondary border border-border/40',
        ghost:
          'hover:bg-accent/20 hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2 has-[>svg]:px-3',
        sm: 'h-9 rounded-lg gap-1.5 px-3 has-[>svg]:px-2.5',
        lg: 'h-11 rounded-xl px-6 has-[>svg]:px-4',
        icon: 'size-11',
        'icon-sm': 'size-10',
        'icon-lg': 'size-12',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : 'button'

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
