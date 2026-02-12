import * as React from 'react'

import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { useGenerationStore } from '@/stores/generation-store'
import { useLibraryStore } from '@/stores/library-store'

function PanelHeader({ title }: { title: string }): React.JSX.Element {
  return (
    <div className="px-4 pt-4">
      <div className="text-xs font-semibold tracking-wider text-muted-foreground">
        {title.toUpperCase()}
      </div>
      <Separator className="mt-3" />
    </div>
  )
}

function PlaceholderThumb({ label }: { label: string }): React.JSX.Element {
  return (
    <div className="relative size-10 overflow-hidden rounded-md border bg-muted">
      <div className="absolute inset-0 flex items-center justify-center text-[10px] text-muted-foreground">
        {label}
      </div>
    </div>
  )
}

export function GenerationInfoPanel(): React.JSX.Element {
  const items = useLibraryStore((s) => s.items)
  const focusedId = useLibraryStore((s) => s.focusedId)
  const media = focusedId ? items.find((m) => m.id === focusedId) ?? null : null

  const generations = useGenerationStore((s) => s.generations)
  const gen = media?.generation_id
    ? generations.find((g) => g.id === media.generation_id) ?? null
    : null

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PanelHeader title="Generation info" />

      <div className="min-h-0 flex-1 space-y-4 overflow-auto px-4 pb-4 pt-4">
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">Prompt</div>
          <ScrollArea className="h-24 rounded-md border bg-background">
            <div className="p-2 text-sm">
              {gen?.prompt ?? (media?.origin === 'generation' ? '—' : 'Not a generated item')}
            </div>
          </ScrollArea>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">Parameters</div>
          <div className="space-y-1 text-xs text-muted-foreground">
            <div>Provider: <span className="text-foreground">{gen?.provider ?? '—'}</span></div>
            <div>Model: <span className="text-foreground">{gen?.model_file ?? '—'}</span></div>
            <div>Resolution: <span className="text-foreground">{gen?.width ?? '—'} × {gen?.height ?? '—'}</span></div>
            <div>Seed: <span className="text-foreground">{gen?.seed ?? '—'}</span></div>
            <div>Steps: <span className="text-foreground">{gen?.steps ?? '—'}</span></div>
            <div>Guidance: <span className="text-foreground">{gen?.guidance ?? '—'}</span></div>
            {gen?.total_time_ms ? (
              <div>Time: <span className="text-foreground">{(gen.total_time_ms / 1000).toFixed(1)}s</span></div>
            ) : null}
          </div>
        </div>

        <Separator />

        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">Reference images</div>
          <div className="flex items-center gap-2">
            <PlaceholderThumb label="In 1" />
            <PlaceholderThumb label="In 2" />
            <Badge variant="outline">mock</Badge>
          </div>
        </div>

        <Separator />

        <div className="space-y-2">
          <Button type="button" variant="secondary" className="w-full">
            View Full Details
          </Button>
          <Button type="button" variant="outline" className="w-full">
            Reload Settings
          </Button>
        </div>
      </div>
    </div>
  )
}
