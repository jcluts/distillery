import * as React from 'react'

import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { useGenerationStore } from '@/stores/generation-store'
import { useLibraryStore } from '@/stores/library-store'
import { useUIStore } from '@/stores/ui-store'
import { SectionLabel } from '@/components/ui/section-label'
import { InfoTable } from '@/components/ui/info-table'
import type { GenerationInput, GenerationRecord } from '@/types'

export function GenerationInfoPane(): React.JSX.Element {
  const items = useLibraryStore((s) => s.items)
  const focusedId = useLibraryStore((s) => s.focusedId)
  const media = focusedId ? (items.find((m) => m.id === focusedId) ?? null) : null

  const generations = useGenerationStore((s) => s.generations)
  const setFormValues = useGenerationStore((s) => s.setFormValues)
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

    void window.api.timeline
      .get(id)
      .then(setGen)
      .catch(() => {})
    void window.api.timeline
      .getGenerationInputs(id)
      .then(setInputs)
      .catch(() => setInputs([]))
  }, [generations, media?.generation_id])

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <SectionLabel>Prompt</SectionLabel>
        <ScrollArea className="h-24 rounded-md border bg-background">
          <div className="p-2 text-sm">
            {gen?.prompt ?? (media?.origin === 'generation' ? '—' : 'Not a generated item')}
          </div>
        </ScrollArea>
      </div>

      <div className="space-y-2">
        <SectionLabel>Parameters</SectionLabel>
        <InfoTable
          items={[
            { label: 'Provider', value: gen?.provider ?? '—' },
            { label: 'Model', value: gen?.model_file ?? '—' },
            {
              label: 'Resolution',
              value: gen?.width && gen?.height ? `${gen.width} × ${gen.height}` : '—'
            },
            { label: 'Seed', value: gen?.seed ?? '—' },
            { label: 'Steps', value: gen?.steps ?? '—' },
            { label: 'Guidance', value: gen?.guidance ?? '—' },
            ...(gen?.total_time_ms
              ? [
                  {
                    label: 'Time',
                    value: `${(gen.total_time_ms / 1000).toFixed(1)}s`
                  }
                ]
              : [])
          ]}
        />
      </div>

      <div className="space-y-2">
        <SectionLabel>Reference images</SectionLabel>
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

      <div className="space-y-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
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
          size="sm"
          className="w-full"
          disabled={!gen}
          onClick={() => {
            if (!gen) return
            setLeftPanelTab('generation')
            const vals: Record<string, unknown> = {}
            if (gen.prompt) vals.prompt = gen.prompt
            if (gen.width && gen.height) vals.size = `${gen.width}*${gen.height}`
            if (gen.steps != null) vals.steps = gen.steps
            if (gen.guidance != null) vals.guidance = gen.guidance
            if (gen.sampling_method) vals.sampling_method = gen.sampling_method
            setFormValues(vals)
          }}
        >
          Reload Settings
        </Button>
      </div>
    </div>
  )
}
