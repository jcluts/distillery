import * as React from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { ASPECT_RATIOS, RESOLUTION_PRESETS } from '@/lib/constants'
import { useGenerationStore } from '@/stores/generation-store'
import { useUIStore } from '@/stores/ui-store'
import type { GenerationInput, GenerationRecord } from '@/types'

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

export function GenerationDetailModal(): React.JSX.Element {
  const activeModals = useUIStore((s) => s.activeModals)
  const closeModal = useUIStore((s) => s.closeModal)
  const setLeftPanelTab = useUIStore((s) => s.setLeftPanelTab)

  const detailGenerationId = useGenerationStore((s) => s.detailGenerationId)
  const setDetailGenerationId = useGenerationStore((s) => s.setDetailGenerationId)
  const setGenerations = useGenerationStore((s) => s.setGenerations)

  const setPrompt = useGenerationStore((s) => s.setPrompt)
  const setResolution = useGenerationStore((s) => s.setResolution)
  const setAspectRatio = useGenerationStore((s) => s.setAspectRatio)
  const setSteps = useGenerationStore((s) => s.setSteps)
  const setGuidance = useGenerationStore((s) => s.setGuidance)
  const setSamplingMethod = useGenerationStore((s) => s.setSamplingMethod)

  const open = activeModals.includes('generation-detail')

  const [gen, setGen] = React.useState<GenerationRecord | null>(null)
  const [inputs, setInputs] = React.useState<GenerationInput[]>([])
  const [outputThumb, setOutputThumb] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open || !detailGenerationId) {
      setGen(null)
      setInputs([])
      setOutputThumb(null)
      return
    }

    void window.api.timeline.get(detailGenerationId).then(setGen).catch(() => setGen(null))
    void window.api.timeline
      .getGenerationInputs(detailGenerationId)
      .then(setInputs)
      .catch(() => setInputs([]))
    void window.api.timeline
      .getThumbnail(detailGenerationId)
      .then(setOutputThumb)
      .catch(() => setOutputThumb(null))
  }, [open, detailGenerationId])

  const close = React.useCallback(() => {
    closeModal('generation-detail')
    setDetailGenerationId(null)
  }, [closeModal, setDetailGenerationId])

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close()
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {gen ? `Generation #${gen.number}` : 'Generation'}
          </DialogTitle>
          <DialogDescription>
            {gen?.created_at ? gen.created_at : '—'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <div className="text-xs font-medium text-muted-foreground">Output</div>
            <div className="aspect-square w-full overflow-hidden rounded-md border bg-muted">
              {outputThumb ? (
                <img
                  src={outputThumb}
                  alt="Generation output"
                  className="h-full w-full object-cover"
                  draggable={false}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                  —
                </div>
              )}
            </div>

            <div className="text-xs font-medium text-muted-foreground">Reference images</div>
            {inputs.length === 0 ? (
              <div className="text-xs text-muted-foreground">—</div>
            ) : (
              <div className="flex items-center gap-2 overflow-x-auto">
                {inputs.map((input) => (
                  <div
                    key={input.id}
                    className="relative size-12 overflow-hidden rounded-md border bg-muted"
                    title={input.original_filename ?? ''}
                  >
                    <img
                      src={input.thumb_path}
                      alt={input.original_filename ?? 'Reference'}
                      className="absolute inset-0 h-full w-full object-cover"
                      draggable={false}
                    />
                  </div>
                ))}
                <Badge variant="outline">{inputs.length}</Badge>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="text-xs font-medium text-muted-foreground">Prompt</div>
            <ScrollArea className="h-32 rounded-md border bg-background">
              <div className="p-2 text-sm">{gen?.prompt ?? '—'}</div>
            </ScrollArea>

            <Separator />

            <div className="text-xs font-medium text-muted-foreground">Parameters</div>
            <div className="space-y-1 text-xs text-muted-foreground">
              <div>
                Provider: <span className="text-foreground">{gen?.provider ?? '—'}</span>
              </div>
              <div>
                Model: <span className="text-foreground">{gen?.model_file ?? '—'}</span>
              </div>
              <div>
                Resolution:{' '}
                <span className="text-foreground">
                  {gen?.width ?? '—'} × {gen?.height ?? '—'}
                </span>
              </div>
              <div>
                Seed: <span className="text-foreground">{gen?.seed ?? '—'}</span>
              </div>
              <div>
                Steps: <span className="text-foreground">{gen?.steps ?? '—'}</span>
              </div>
              <div>
                Guidance: <span className="text-foreground">{gen?.guidance ?? '—'}</span>
              </div>
              {gen?.total_time_ms ? (
                <div>
                  Time:{' '}
                  <span className="text-foreground">
                    {(gen.total_time_ms / 1000).toFixed(1)}s
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={!gen}
            onClick={async () => {
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

              close()
            }}
          >
            Reload Settings
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={!detailGenerationId}
            onClick={async () => {
              if (!detailGenerationId) return
              await window.api.timeline.remove(detailGenerationId)
              const { generations } = await window.api.timeline.getAll()
              setGenerations(generations)
              close()
            }}
          >
            Remove from Timeline
          </Button>
          <Button type="button" variant="secondary" onClick={close}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
