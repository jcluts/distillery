import * as React from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { useGenerationStore } from '@/stores/generation-store'
import { useUIStore } from '@/stores/ui-store'
import { TimelineItemCard } from './TimelineItemCard'

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

export function TimelinePanel(): React.JSX.Element {
  const generations = useGenerationStore((s) => s.generations)
  const setGenerations = useGenerationStore((s) => s.setGenerations)
  const setDetailGenerationId = useGenerationStore((s) => s.setDetailGenerationId)
  const openModal = useUIStore((s) => s.openModal)

  const [thumbs, setThumbs] = React.useState<Record<string, string>>({})

  React.useEffect(() => {
    const ids = generations.map((g) => g.id)
    if (ids.length === 0) {
      setThumbs({})
      return
    }

    void window.api.timeline.getThumbnailsBatch(ids).then(setThumbs).catch(() => {})
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
              <TimelineItemCard
                key={g.id}
                generation={g}
                thumbnailSrc={thumbs[g.id]}
                onOpen={() => {
                  setDetailGenerationId(g.id)
                  openModal('generation-detail')
                }}
              />
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}
