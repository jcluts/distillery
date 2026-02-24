import * as React from 'react'

import { parseAspectRatio } from '@/lib/transform-math'
import { useTransformStore } from '@/stores/transform-store'
import type { NormalizedCropRect } from '@/types'

type DragHandle = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

const MIN_CROP_SIZE = 0.02
const GOLDEN = 0.61803398875

function clampRect(crop: NormalizedCropRect): NormalizedCropRect {
  const w = Math.max(MIN_CROP_SIZE, Math.min(1, crop.w))
  const h = Math.max(MIN_CROP_SIZE, Math.min(1, crop.h))
  const x = Math.min(1 - w, Math.max(0, crop.x))
  const y = Math.min(1 - h, Math.max(0, crop.y))
  return { x, y, w, h }
}

function applyMove(start: NormalizedCropRect, dx: number, dy: number): NormalizedCropRect {
  return clampRect({
    x: start.x + dx,
    y: start.y + dy,
    w: start.w,
    h: start.h
  })
}

function applyResize(
  start: NormalizedCropRect,
  handle: Exclude<DragHandle, 'move'>,
  dx: number,
  dy: number,
  ratio: number | null
): NormalizedCropRect {
  const left0 = start.x
  const top0 = start.y
  const right0 = start.x + start.w
  const bottom0 = start.y + start.h

  let left = left0
  let top = top0
  let right = right0
  let bottom = bottom0

  if (handle.includes('w')) left = left0 + dx
  if (handle.includes('e')) right = right0 + dx
  if (handle.includes('n')) top = top0 + dy
  if (handle.includes('s')) bottom = bottom0 + dy

  if (ratio) {
    if (handle === 'nw' || handle === 'ne' || handle === 'sw' || handle === 'se') {
      const anchorX = handle.includes('w') ? right0 : left0
      const anchorY = handle.includes('n') ? bottom0 : top0
      const movingX = handle.includes('w') ? left : right
      const movingY = handle.includes('n') ? top : bottom

      const maxW = Math.max(MIN_CROP_SIZE, Math.abs(anchorX - movingX))
      const maxH = Math.max(MIN_CROP_SIZE, Math.abs(anchorY - movingY))

      let width = maxW
      let height = width / ratio
      if (height > maxH) {
        height = maxH
        width = height * ratio
      }

      left = handle.includes('w') ? anchorX - width : anchorX
      right = handle.includes('w') ? anchorX : anchorX + width
      top = handle.includes('n') ? anchorY - height : anchorY
      bottom = handle.includes('n') ? anchorY : anchorY + height
    }

    if (handle === 'e' || handle === 'w') {
      const width = Math.max(MIN_CROP_SIZE, Math.abs(right - left))
      const height = Math.max(MIN_CROP_SIZE, width / ratio)
      const centerY = (top0 + bottom0) / 2

      if (handle === 'w') {
        left = right0 - width
        right = right0
      } else {
        left = left0
        right = left0 + width
      }

      top = centerY - height / 2
      bottom = centerY + height / 2
    }

    if (handle === 'n' || handle === 's') {
      const height = Math.max(MIN_CROP_SIZE, Math.abs(bottom - top))
      const width = Math.max(MIN_CROP_SIZE, height * ratio)
      const centerX = (left0 + right0) / 2

      if (handle === 'n') {
        top = bottom0 - height
        bottom = bottom0
      } else {
        top = top0
        bottom = top0 + height
      }

      left = centerX - width / 2
      right = centerX + width / 2
    }
  }

  const rect = {
    x: Math.min(left, right),
    y: Math.min(top, bottom),
    w: Math.abs(right - left),
    h: Math.abs(bottom - top)
  }

  return clampRect(rect)
}

function guideLines(mode: 'thirds' | 'grid' | 'golden'): number[] {
  if (mode === 'grid') return [0.25, 0.5, 0.75]
  if (mode === 'golden') return [1 - GOLDEN, GOLDEN]
  return [1 / 3, 2 / 3]
}

interface HandleDef {
  id: Exclude<DragHandle, 'move'>
  className: string
  cursor: string
}

const HANDLES: HandleDef[] = [
  { id: 'nw', className: '-left-1.5 -top-1.5', cursor: 'nwse-resize' },
  { id: 'n', className: 'left-1/2 -top-1.5 -translate-x-1/2', cursor: 'ns-resize' },
  { id: 'ne', className: '-right-1.5 -top-1.5', cursor: 'nesw-resize' },
  { id: 'e', className: '-right-1.5 top-1/2 -translate-y-1/2', cursor: 'ew-resize' },
  { id: 'se', className: '-right-1.5 -bottom-1.5', cursor: 'nwse-resize' },
  { id: 's', className: 'left-1/2 -bottom-1.5 -translate-x-1/2', cursor: 'ns-resize' },
  { id: 'sw', className: '-left-1.5 -bottom-1.5', cursor: 'nesw-resize' },
  { id: 'w', className: '-left-1.5 top-1/2 -translate-y-1/2', cursor: 'ew-resize' }
]

export function CropOverlay(): React.JSX.Element | null {
  const cropMode = useTransformStore((s) => s.cropMode)
  const pendingCrop = useTransformStore((s) => s.pendingCrop)
  const cropAspectRatio = useTransformStore((s) => s.cropAspectRatio)
  const cropOverlay = useTransformStore((s) => s.cropOverlay)
  const cropGuide = useTransformStore((s) => s.cropGuide)

  const setPendingCrop = useTransformStore((s) => s.setPendingCrop)

  const dragRef = React.useRef<{
    handle: DragHandle
    startCrop: NormalizedCropRect
    startClientX: number
    startClientY: number
  } | null>(null)

  const imageX = cropOverlay?.imageX ?? 0
  const imageY = cropOverlay?.imageY ?? 0
  const imageWidth = cropOverlay?.imageWidth ?? 1
  const imageHeight = cropOverlay?.imageHeight ?? 1

  const overlayReady =
    cropMode &&
    !!pendingCrop &&
    !!cropOverlay &&
    cropOverlay.imageWidth > 0 &&
    cropOverlay.imageHeight > 0

  const activeCrop = pendingCrop ?? { x: 0, y: 0, w: 1, h: 1 }

  const cropPx = {
    left: imageX + activeCrop.x * imageWidth,
    top: imageY + activeCrop.y * imageHeight,
    width: activeCrop.w * imageWidth,
    height: activeCrop.h * imageHeight
  }

  const onDragStart = (event: React.MouseEvent, handle: DragHandle): void => {
    if (!overlayReady) return
    event.preventDefault()
    event.stopPropagation()

    dragRef.current = {
      handle,
      startCrop: activeCrop,
      startClientX: event.clientX,
      startClientY: event.clientY
    }
  }

  React.useEffect(() => {
    const onMouseMove = (event: MouseEvent): void => {
      if (!overlayReady) return
      const drag = dragRef.current
      if (!drag) return

      const dx = (event.clientX - drag.startClientX) / imageWidth
      const dy = (event.clientY - drag.startClientY) / imageHeight
      const ratio = parseAspectRatio(cropAspectRatio)

      const next =
        drag.handle === 'move'
          ? applyMove(drag.startCrop, dx, dy)
          : applyResize(drag.startCrop, drag.handle, dx, dy, ratio)

      setPendingCrop(next)
    }

    const onMouseUp = (): void => {
      dragRef.current = null
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)

    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }, [cropAspectRatio, imageHeight, imageWidth, overlayReady, setPendingCrop])

  if (!overlayReady) {
    return null
  }

  const lines = guideLines(cropGuide)

  return (
    <div className="pointer-events-none absolute inset-0 z-30 select-none">
      <div
        className="absolute bg-black/45"
        style={{ left: imageX, top: imageY, width: imageWidth, height: cropPx.top - imageY }}
      />
      <div
        className="absolute bg-black/45"
        style={{
          left: imageX,
          top: cropPx.top,
          width: cropPx.left - imageX,
          height: cropPx.height
        }}
      />
      <div
        className="absolute bg-black/45"
        style={{
          left: cropPx.left + cropPx.width,
          top: cropPx.top,
          width: imageX + imageWidth - (cropPx.left + cropPx.width),
          height: cropPx.height
        }}
      />
      <div
        className="absolute bg-black/45"
        style={{
          left: imageX,
          top: cropPx.top + cropPx.height,
          width: imageWidth,
          height: imageY + imageHeight - (cropPx.top + cropPx.height)
        }}
      />

      <div
        className="pointer-events-auto absolute border-2 border-white/90 shadow-[0_0_0_1px_rgba(0,0,0,0.5)]"
        style={{
          left: cropPx.left,
          top: cropPx.top,
          width: cropPx.width,
          height: cropPx.height,
          cursor: 'move'
        }}
        onMouseDown={(event) => onDragStart(event, 'move')}
      >
        {lines.map((line) => (
          <React.Fragment key={`v-${line}`}>
            <div
              className="absolute top-0 bottom-0 w-px bg-white/40"
              style={{ left: `${line * 100}%` }}
            />
            <div
              className="absolute left-0 right-0 h-px bg-white/40"
              style={{ top: `${line * 100}%` }}
            />
          </React.Fragment>
        ))}

        {HANDLES.map((handle) => (
          <div
            key={handle.id}
            className={`absolute size-3 rounded-sm border border-white/90 bg-black/60 ${handle.className}`}
            style={{ cursor: handle.cursor }}
            onMouseDown={(event) => onDragStart(event, handle.id)}
          />
        ))}
      </div>
    </div>
  )
}
