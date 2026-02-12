import * as React from 'react'

import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { useGenerationStore } from '@/stores/generation-store'
import { useLibraryStore } from '@/stores/library-store'
import { useUIStore } from '@/stores/ui-store'
import type { GenerationInput, GenerationRecord } from '@/types'
import { ASPECT_RATIOS, RESOLUTION_PRESETS } from '@/lib/constants'

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

function pickAspectRatioLabel(width: number, height: number): string {
  const target = width / height
  let best: (typeof ASPECT_RATIOS)[number] = ASPECT_RATIOS[0]!
  let bestDiff = Infinity
  for (const r of ASPECT_RATIOS) {
    const ratio = r.width / r.height
    const diff = Math.abs(ratio - target)
    if (diff < bestDiff) {
      best = r
      bestDiff = diff
    }
  }
  return best.label
}

function pickResolution(longEdge: number): number {
  const values = RESOLUTION_PRESETS.map((p) => p.value)
  let best = values[0] ?? longEdge
  let bestDiff = Infinity
  for (const v of values) {
    const diff = Math.abs(v - longEdge)
    if (diff < bestDiff) {
      best = v
      bestDiff = diff
    }
  }
  return best
}

export function GenerationInfoPanel(): React.JSX.Element {
  const items = useLibraryStore((s) => s.items)
  const focusedId = useLibraryStore((s) => s.focusedId)
  const media = focusedId ? items.find((m) => m.id === focusedId) ?? null : null

  const generations = useGenerationStore((s) => s.generations)
  const setPrompt = useGenerationStore((s) => s.setPrompt)
  const setResolution = useGenerationStore((s) => s.setResolution)
  const setAspectRatio = useGenerationStore((s) => s.setAspectRatio)
  const setSteps = useGenerationStore((s) => s.setSteps)
  const setGuidance = useGenerationStore((s) => s.setGuidance)
  const setSamplingMethod = useGenerationStore((s) => s.setSamplingMethod)
  const setDetailGenerationId = useGenerationStore((s) => s.setDetailGenerationId)

  const openModal = useUIStore((s) => s.openModal)
  const setViewMode = useUIStore((s) => s.setViewMode)
  const setLeftPanelTab = useUIStore((s) => s.setLeftPanelTab)
  const selectSingle = useLibraryStore((s) => s.selectSingle)

  const [gen, setGen] = React.useState<GenerationRecord | null>(null)
  const [inputs, setInputs] = React.useState<GenerationInput[]>([])

  React.useEffect(() => {
    const id = media?.generation_id
    if (!id) {
      setGen(null)
      setInputs([])
      return
    }

    const fromStore = generations.find((g) => g.id === id) ?? null
    if (fromStore) setGen(fromStore)

    void window.api.timeline.get(id).then(setGen).catch(() => {})
    void window.api.timeline.getGenerationInputs(id).then(setInputs).catch(() => setInputs([]))
  }, [generations, media?.generation_id])

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
          {inputs.length === 0 ? (
            <div className="text-xs text-muted-foreground">—</div>
          ) : (
            <div className="flex items-center gap-2 overflow-x-auto">
              {inputs.map((input) => (
                <button
                  key={input.id}
                  type="button"
                  className="relative size-10 overflow-hidden rounded-md border bg-muted"
                  onClick={() => {
                    if (input.media_id) {
                      selectSingle(input.media_id)
                      setViewMode('grid')
                    }
                  }}
                  title={input.original_filename ?? ''}
                >
                  <img
                    src={input.thumb_path}
                    alt={input.original_filename ?? 'Reference'}
                    className="absolute inset-0 h-full w-full object-cover"
                    draggable={false}
                  />
                </button>
              ))}
              <Badge variant="outline">{inputs.length}</Badge>
            </div>
          )}
        </div>

        <Separator />

        <div className="space-y-2">
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            disabled={!gen}
            onClick={() => {
              if (!gen) return
              setDetailGenerationId(gen.id)
              openModal('generation-detail')
            }}
          >
            View Full Details
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={!gen}
            onClick={() => {
              if (!gen) return
              setLeftPanelTab('generation')
              setPrompt(gen.prompt ?? '')

              if (gen.width && gen.height) {
                const longEdge = Math.max(gen.width, gen.height)
                setResolution(pickResolution(longEdge))
                setAspectRatio(pickAspectRatioLabel(gen.width, gen.height) as any)
              }
              if (gen.steps != null) setSteps(gen.steps)
              if (gen.guidance != null) setGuidance(gen.guidance)
              if (gen.sampling_method) setSamplingMethod(gen.sampling_method)
            }}
          >
            Reload Settings
          </Button>
        </div>
      </div>
    </div>
  )
}
