import * as React from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { useGenerationStore } from '@/stores/generation-store'
import { useUIStore } from '@/stores/ui-store'
import { cn } from '@/lib/utils'
import type { GenerationInput } from '@/types'

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

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime()
  const delta = Date.now() - t
  if (!Number.isFinite(delta) || delta < 0) return 'Just now'
  const sec = Math.floor(delta / 1000)
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  return `${day}d ago`
}

export function TimelinePanel(): React.JSX.Element {
  const generations = useGenerationStore((s) => s.generations)
  const setGenerations = useGenerationStore((s) => s.setGenerations)
  const setDetailGenerationId = useGenerationStore((s) => s.setDetailGenerationId)
  const openModal = useUIStore((s) => s.openModal)

  const [thumbs, setThumbs] = React.useState<Record<string, string>>({})
  const [inputsByGen, setInputsByGen] = React.useState<Record<string, GenerationInput[]>>({})

  React.useEffect(() => {
    const ids = generations.map((g) => g.id)
    if (ids.length === 0) {
      setThumbs({})
      setInputsByGen({})
      return
    }

    void window.api.timeline.getThumbnailsBatch(ids).then(setThumbs).catch(() => {})

    // Load inputs (best-effort) for thumbnail strip
    void (async () => {
      const next: Record<string, GenerationInput[]> = {}
      for (const id of ids.slice(0, 50)) {
        try {
          next[id] = await window.api.timeline.getGenerationInputs(id)
        } catch {
          next[id] = []
        }
      }
      setInputsByGen(next)
    })()
  }, [generations])

  const clearCompleted = React.useCallback(async () => {
    await window.api.timeline.clearCompleted()
    const { generations } = await window.api.timeline.getAll()
    setGenerations(generations)
  }, [setGenerations])

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
          <div className="space-y-3">
            {generations.map((g) => (
              <Card
                key={g.id}
                className="w-full cursor-default overflow-hidden p-3 hover:bg-accent/40"
                onClick={() => {
                  setDetailGenerationId(g.id)
                  openModal('generation-detail')
                }}
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
                      <span>{formatRelative(g.created_at)}</span>
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
                    <div className="relative size-10 overflow-hidden rounded-md border bg-muted">
                      {thumbs[g.id] ? (
                        <img
                          src={thumbs[g.id]}
                          alt={`Output for #${g.number}`}
                          className="absolute inset-0 h-full w-full object-cover"
                          draggable={false}
                        />
                      ) : null}
                    </div>
                    <div className="relative size-10 overflow-hidden rounded-md border bg-muted">
                      {inputsByGen[g.id]?.[0]?.thumb_path ? (
                        <img
                          src={inputsByGen[g.id]![0]!.thumb_path}
                          alt={`Input for #${g.number}`}
                          className="absolute inset-0 h-full w-full object-cover"
                          draggable={false}
                        />
                      ) : null}
                    </div>
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
