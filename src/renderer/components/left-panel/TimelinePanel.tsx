import * as React from 'react'

import { useGenerationStore } from '@/stores/generation-store'
import { useUIStore } from '@/stores/ui-store'
import { TimelineItemCard } from './TimelineItemCard'

export function TimelinePanel(): React.JSX.Element {
  const generations = useGenerationStore((s) => s.generations)
  const setDetailGenerationId = useGenerationStore((s) => s.setDetailGenerationId)
  const openModal = useUIStore((s) => s.openModal)

  const [thumbs, setThumbs] = React.useState<Record<string, string>>({})

  React.useEffect(() => {
    const ids = generations.map((g) => g.id)
    if (ids.length === 0) {
      setThumbs({})
      return
    }

    void window.api.timeline
      .getThumbnailsBatch(ids)
      .then(setThumbs)
      .catch(() => {})
  }, [generations])

  return (
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
  )
}
