import * as React from 'react'
import { cn } from '@/lib/utils'

function SectionLabel({ className, ...props }: React.ComponentProps<'div'>): React.JSX.Element {
  return <div className={cn('text-sm font-medium text-muted-foreground', className)} {...props} />
}

export { SectionLabel }
