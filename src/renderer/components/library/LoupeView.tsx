import * as React from 'react'

import { useLibraryStore } from '@/stores/library-store'
import { useUIStore } from '@/stores/ui-store'
import { useTransformStore } from '@/stores/transform-store'
import { useRemovalStore } from '@/stores/removal-store'
import { CanvasViewer } from '@/components/library/canvas/CanvasViewer'
import { CropOverlay } from '@/components/library/canvas/CropOverlay'
import { MaskOverlay } from '@/components/library/canvas/MaskOverlay'
import { VideoPlayer } from '@/components/library/VideoPlayer'
import { LoupeFilmstrip } from '@/components/library/LoupeFilmstrip'

export function LoupeView(): React.JSX.Element {
  const items = useLibraryStore((s) => s.items)
  const focusedId = useLibraryStore((s) => s.focusedId)
  const selectSingle = useLibraryStore((s) => s.selectSingle)
  const loupeZoom = useUIStore((s) => s.loupeZoom)
  const cropMode = useTransformStore((s) => s.cropMode)
  const cropMediaId = useTransformStore((s) => s.cropMediaId)
  const cancelCrop = useTransformStore((s) => s.cancelCrop)
  const paintMode = useRemovalStore((s) => s.paintMode)
  const paintMediaId = useRemovalStore((s) => s.paintMediaId)
  const cancelPaintMode = useRemovalStore((s) => s.cancelPaintMode)

  const currentIndex = focusedId ? items.findIndex((m) => m.id === focusedId) : -1
  const current = currentIndex >= 0 ? items[currentIndex] : (items[0] ?? null)

  React.useEffect(() => {
    if (!focusedId && items[0]) {
      selectSingle(items[0].id)
    }
  }, [focusedId, items, selectSingle])

  React.useEffect(() => {
    if (!cropMode || !cropMediaId) {
      return
    }

    if (!current || current.id !== cropMediaId || current.media_type !== 'image') {
      cancelCrop()
    }
  }, [cancelCrop, cropMediaId, cropMode, current])

  React.useEffect(() => {
    if (!paintMode || !paintMediaId) {
      return
    }

    if (!current || current.id !== paintMediaId || current.media_type !== 'image') {
      cancelPaintMode()
    }
  }, [cancelPaintMode, current, paintMediaId, paintMode])

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-hidden pt-4 px-4 pb-2">
        {current?.media_type === 'video' ? (
          <VideoPlayer media={current} zoom={loupeZoom} />
        ) : (
          <div className="relative h-full w-full">
            <CanvasViewer media={current} zoom={loupeZoom} />
            <CropOverlay />
            <MaskOverlay />
          </div>
        )}
      </div>

      <LoupeFilmstrip items={items} currentIndex={currentIndex} onSelect={selectSingle} />
    </div>
  )
}
