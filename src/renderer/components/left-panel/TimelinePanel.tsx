import * as React from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { useGenerationStore } from '@/stores/generation-store'
import { cn } from '@/lib/utils'

function PanelHeader({ title, right }: { title: string; right?: React.ReactNode }): React.JSX.Element {
  return (
    <div className="px-4 pt-4">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold tracking-wider text-muted-foreground">
          {title.toUpperCase()}
        </div>
        {right}
      </div>
      <Separator className="mt-3" />
    </div>
  )
}

function statusBadgeVariant(status: string): 'default' | 'secondary' | 'outline' {
  if (status === 'completed') return 'default'
  if (status === 'failed') return 'outline'
  return 'secondary'
}

export function TimelinePanel(): React.JSX.Element {
  const generations = useGenerationStore((s) => s.generations)
  const clearCompleted = useGenerationStore((s) => s.clearCompleted)

  const activeCount = generations.filter((g) => g.status === 'pending').length

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PanelHeader
        title="Timeline"
        right={
          <div className="flex items-center gap-2">
            {activeCount > 0 ? (
              <Badge variant="secondary">{activeCount}</Badge>
            ) : null}
            <Button type="button" size="sm" variant="secondary" onClick={clearCompleted}>
              Clear completed
            </Button>
          </div>
        }
      />

      <div className="min-h-0 flex-1 overflow-hidden px-4 pb-4 pt-4">
        <ScrollArea className="h-full">
          <div className="space-y-3 pr-2">
            {generations.map((g) => (
              <Card
                key={g.id}
                className="cursor-default p-3 hover:bg-accent/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant={statusBadgeVariant(g.status)}>
                        {g.status}
                      </Badge>
                      <span className="text-xs font-medium text-muted-foreground">
                        #{g.number}
                      </span>
                    </div>
                    <div className="mt-1 line-clamp-2 text-sm">
                      {g.prompt ?? ''}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span className="truncate">{g.model_file ?? 'Model'}</span>
                      {g.total_time_ms ? (
                        <span className="tabular-nums">{(g.total_time_ms / 1000).toFixed(1)}s</span>
                      ) : null}
                      {g.error ? (
                        <span className={cn('truncate', 'text-destructive')}>
                          {g.error}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <div className="size-10 rounded-md border bg-muted" />
                    <div className="size-10 rounded-md border bg-muted" />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}
