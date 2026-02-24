import * as React from 'react'
import {
  FlipHorizontal2,
  FlipVertical2,
  RotateCcw,
  RotateCw,
  Crop as CropIcon,
  Check,
  X,
  Undo2
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { SectionLabel } from '@/components/ui/section-label'
import { AspectIcon } from '@/components/generation/AspectIcon'
import { useLibraryStore } from '@/stores/library-store'
import { useTransformStore } from '@/stores/transform-store'
import { isDefaultTransforms } from '@/lib/transform-math'

const ASPECT_RATIO_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'free', label: 'Free' },
  { value: '1:1', label: '1:1' },
  { value: '5:4', label: '5:4' },
  { value: '4:5', label: '4:5' },
  { value: '4:3', label: '4:3' },
  { value: '3:4', label: '3:4' },
  { value: '3:2', label: '3:2' },
  { value: '2:3', label: '2:3' },
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
  { value: '21:9', label: '21:9' },
  { value: '9:21', label: '9:21' }
]

const GUIDE_OPTIONS: Array<{ value: 'thirds' | 'grid' | 'golden'; label: string }> = [
  { value: 'thirds', label: 'Thirds' },
  { value: 'grid', label: 'Grid' },
  { value: 'golden', label: 'Golden' }
]

export function TransformPane(): React.JSX.Element {
  const focusedId = useLibraryStore((s) => s.focusedId)
  const focusedItem = useLibraryStore((s) => {
    if (!s.focusedId) return null
    return s.items.find((item) => item.id === s.focusedId) ?? null
  })

  const transforms = useTransformStore((s) => (focusedId ? s.transforms[focusedId] ?? null : null))
  const cropMode = useTransformStore((s) => s.cropMode)
  const cropMediaId = useTransformStore((s) => s.cropMediaId)
  const cropAspectRatio = useTransformStore((s) => s.cropAspectRatio)
  const cropGuide = useTransformStore((s) => s.cropGuide)

  const loadTransforms = useTransformStore((s) => s.loadTransforms)
  const rotate = useTransformStore((s) => s.rotate)
  const flipH = useTransformStore((s) => s.flipH)
  const flipV = useTransformStore((s) => s.flipV)
  const enterCropMode = useTransformStore((s) => s.enterCropMode)
  const setCropAspectRatio = useTransformStore((s) => s.setCropAspectRatio)
  const setCropGuide = useTransformStore((s) => s.setCropGuide)
  const applyCrop = useTransformStore((s) => s.applyCrop)
  const cancelCrop = useTransformStore((s) => s.cancelCrop)
  const resetAll = useTransformStore((s) => s.resetAll)

  React.useEffect(() => {
    if (focusedId && focusedItem?.media_type === 'image') {
      void loadTransforms(focusedId)
    }
  }, [focusedId, focusedItem?.media_type, loadTransforms])

  if (!focusedItem) {
    return (
      <div className="flex items-center justify-center px-4 py-8 text-sm text-muted-foreground">
        Select an image to transform
      </div>
    )
  }

  if (focusedItem.media_type !== 'image') {
    return (
      <div className="flex items-center justify-center px-4 py-8 text-sm text-muted-foreground">
        Transforms are available for images only
      </div>
    )
  }

  const hasTransforms = !isDefaultTransforms(transforms)
  const isCropTarget = cropMode && cropMediaId === focusedItem.id

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <SectionLabel>Rotate & Flip</SectionLabel>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => void rotate(focusedItem.id, 'ccw')}
            disabled={isCropTarget}
            aria-label="Rotate counterclockwise"
          >
            <RotateCcw className="size-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => void rotate(focusedItem.id, 'cw')}
            disabled={isCropTarget}
            aria-label="Rotate clockwise"
          >
            <RotateCw className="size-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => void flipH(focusedItem.id)}
            disabled={isCropTarget}
            aria-label="Flip horizontally"
          >
            <FlipHorizontal2 className="size-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => void flipV(focusedItem.id)}
            disabled={isCropTarget}
            aria-label="Flip vertically"
          >
            <FlipVertical2 className="size-4" />
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <SectionLabel className="mb-1.5">Aspect Ratio</SectionLabel>
          <div className="grid grid-cols-4 gap-1">
            {ASPECT_RATIO_OPTIONS.map((option) => {
              const isActive = (cropAspectRatio ?? 'free') === option.value
              return (
                <Button
                  key={option.value}
                  variant={isActive ? 'secondary' : 'outline'}
                  size="xs"
                  onClick={() => setCropAspectRatio(option.value)}
                  disabled={!isCropTarget}
                  className={
                    isActive
                      ? 'h-8 w-full border-primary/50 bg-primary/10'
                      : 'h-8 w-full'
                  }
                >
                  {option.value !== 'free' && <AspectIcon ratio={option.value} />}
                  {option.label}
                </Button>
              )
            })}
          </div>
        </div>

        <div>
          <SectionLabel className="mb-1.5">Guides</SectionLabel>
          <div className="grid grid-cols-3 gap-1">
            {GUIDE_OPTIONS.map((option) => {
              const isActive = cropGuide === option.value
              return (
                <Button
                  key={option.value}
                  variant={isActive ? 'secondary' : 'outline'}
                  size="xs"
                  onClick={() => setCropGuide(option.value)}
                  className={
                    isActive
                      ? 'h-8 w-full border-primary/50 bg-primary/10'
                      : 'h-8 w-full'
                  }
                >
                  {option.label}
                </Button>
              )
            })}
          </div>
        </div>

        <div>
          {!isCropTarget ? (
            <Button type="button" variant="outline" className="w-full" onClick={() => void enterCropMode()}>
              <CropIcon className="mr-2 size-4" />
              Crop
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button type="button" className="flex-1" onClick={() => void applyCrop()}>
                <Check className="mr-2 size-4" />
                Apply
              </Button>
              <Button type="button" variant="outline" className="flex-1" onClick={cancelCrop}>
                <X className="mr-2 size-4" />
                Cancel
              </Button>
            </div>
          )}
        </div>
      </div>

      {hasTransforms && (
        <div className="space-y-2">
          <SectionLabel>Reset</SectionLabel>
          <Button type="button" variant="outline" className="w-full" onClick={() => void resetAll(focusedItem.id)}>
            <Undo2 className="mr-2 size-4" />
            Reset All
          </Button>
        </div>
      )}
    </div>
  )
}
