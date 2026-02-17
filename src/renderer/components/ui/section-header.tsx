import * as React from 'react'
import { cn } from '@/lib/utils'

function SectionHeader({ className, ...props }: React.ComponentProps<'div'>): React.JSX.Element {
  return (
    <div
      className={cn('text-sm font-semibold tracking-wider text-foreground uppercase', className)}
      {...props}
    />
  )
}

export { SectionHeader }
