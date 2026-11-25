import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

const variants = {
  default: 'bg-primary text-primary-foreground',
  outline: 'border border-border bg-transparent',
  ghost: 'bg-transparent',
}

const sizes = {
  default: 'min-h-11 px-4 py-2',
  sm: 'min-h-11 gap-1.5 px-3 py-2',
  lg: 'min-h-12 px-5 py-3',
}

function Button({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: ComponentProps<'button'> & {
  variant?: keyof typeof variants
  size?: keyof typeof sizes
}) {
  return (
    <button
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-2 text-sm font-medium transition-transform duration-[140ms] ease-[var(--ease-out)] motion-reduce:transition-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
        variants[variant], sizes[size], className,
      )}
      {...props}
    />
  )
}

export { Button }
