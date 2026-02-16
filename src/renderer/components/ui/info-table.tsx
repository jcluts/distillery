import * as React from 'react'
import { cn } from '@/lib/utils'

export interface InfoTableItem {
  label: string
  value: React.ReactNode
}

function InfoTable({
  items,
  className,
  ...props
}: { items: InfoTableItem[] } & Omit<React.ComponentProps<'div'>, 'children'>): React.JSX.Element {
  return (
    <div className={cn('rounded-lg border bg-muted/50 text-xs', className)} {...props}>
      {items.map((item, i) => (
        <div
          key={item.label}
          className={cn(
            'flex items-baseline justify-between gap-4 px-3 py-1.5',
            i !== items.length - 1 && 'border-b border-border/50'
          )}
        >
          <span className="shrink-0 text-muted-foreground">{item.label}</span>
          <span className="truncate text-right font-mono text-foreground">{item.value}</span>
        </div>
      ))}
    </div>
  )
}

export { InfoTable }
