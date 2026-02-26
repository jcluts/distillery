import * as React from 'react'

import { useLibraryStore } from '@/stores/library-store'
import { useRemovalStore } from '@/stores/removal-store'
import type { RemovalStroke } from '@/types'

interface DraftStroke {
  points: Array<{ x: number; y: number }>
  erasing: boolean
  brushSizeNormalized: number
}

function clamp01(value: number): number {
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

function drawStroke(
  ctx: CanvasRenderingContext2D,
  stroke: RemovalStroke | DraftStroke,
  imageX: number,
  imageY: number,
  imageWidth: number,
  imageHeight: number
): void {
  if (stroke.points.length === 0) {
    return
  }

  const brushSizePx = Math.max(1, stroke.brushSizeNormalized * imageWidth)
  const first = stroke.points[0]
  const firstX = imageX + first.x * imageWidth
  const firstY = imageY + first.y * imageHeight

  ctx.lineWidth = brushSizePx
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  if (stroke.erasing) {
    ctx.globalCompositeOperation = 'destination-out'
    ctx.strokeStyle = 'rgba(0,0,0,1)'
    ctx.fillStyle = 'rgba(0,0,0,1)'
  } else {
    ctx.globalCompositeOperation = 'source-over'
    ctx.strokeStyle = 'rgba(255, 88, 88, 0.82)'
    ctx.fillStyle = 'rgba(255, 88, 88, 0.4)'
  }

  if (stroke.points.length === 1) {
    ctx.beginPath()
    ctx.arc(firstX, firstY, brushSizePx / 2, 0, Math.PI * 2)
    ctx.fill()
    return
  }

  ctx.beginPath()
  ctx.moveTo(firstX, firstY)

  for (let i = 1; i < stroke.points.length; i += 1) {
    const point = stroke.points[i]
    ctx.lineTo(imageX + point.x * imageWidth, imageY + point.y * imageHeight)
  }

  ctx.stroke()
}

export function MaskOverlay(): React.JSX.Element | null {
  const focusedId = useLibraryStore((state) => state.focusedId)

  const paintMode = useRemovalStore((state) => state.paintMode)
  const paintMediaId = useRemovalStore((state) => state.paintMediaId)
  const maskOverlay = useRemovalStore((state) => state.maskOverlay)
  const draftStrokes = useRemovalStore((state) => state.draftStrokes)
  const tool = useRemovalStore((state) => state.tool)
  const brushSizeNormalized = useRemovalStore((state) => state.brushSizeNormalized)
  const addStroke = useRemovalStore((state) => state.addStroke)

  const canvasRef = React.useRef<HTMLCanvasElement | null>(null)
  const wrapperRef = React.useRef<HTMLDivElement | null>(null)
  const drawingRef = React.useRef(false)
  const draftPointsRef = React.useRef<Array<{ x: number; y: number }>>([])

  const [cursor, setCursor] = React.useState<{ x: number; y: number } | null>(null)

  const isPaintTarget =
    paintMode && !!paintMediaId && !!focusedId && paintMediaId === focusedId && !!maskOverlay

  const imageX = maskOverlay?.imageX ?? 0
  const imageY = maskOverlay?.imageY ?? 0
  const imageWidth = maskOverlay?.imageWidth ?? 1
  const imageHeight = maskOverlay?.imageHeight ?? 1

  const resizeCanvas = React.useCallback(() => {
    const wrapper = wrapperRef.current
    const canvas = canvasRef.current
    if (!wrapper || !canvas || !maskOverlay) {
      return
    }

    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.max(1, Math.round(maskOverlay.containerWidth * dpr))
    canvas.height = Math.max(1, Math.round(maskOverlay.containerHeight * dpr))
    canvas.style.width = `${maskOverlay.containerWidth}px`
    canvas.style.height = `${maskOverlay.containerHeight}px`

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }, [maskOverlay])

  const redraw = React.useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !maskOverlay) {
      return
    }

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return
    }

    ctx.clearRect(0, 0, maskOverlay.containerWidth, maskOverlay.containerHeight)

    for (const stroke of draftStrokes) {
      drawStroke(ctx, stroke, imageX, imageY, imageWidth, imageHeight)
    }

    if (drawingRef.current && draftPointsRef.current.length > 0) {
      drawStroke(
        ctx,
        {
          points: draftPointsRef.current,
          erasing: tool === 'erase',
          brushSizeNormalized
        },
        imageX,
        imageY,
        imageWidth,
        imageHeight
      )
    }

    ctx.globalCompositeOperation = 'source-over'
  }, [brushSizeNormalized, draftStrokes, imageHeight, imageWidth, imageX, imageY, maskOverlay, tool])

  React.useEffect(() => {
    resizeCanvas()
    redraw()
  }, [redraw, resizeCanvas])

  const toNormalizedPoint = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>): { x: number; y: number } | null => {
      if (!maskOverlay) {
        return null
      }

      const targetRect = event.currentTarget.getBoundingClientRect()
      const localX = event.clientX - targetRect.left
      const localY = event.clientY - targetRect.top

      if (
        localX < imageX ||
        localY < imageY ||
        localX > imageX + imageWidth ||
        localY > imageY + imageHeight
      ) {
        return null
      }

      return {
        x: clamp01((localX - imageX) / imageWidth),
        y: clamp01((localY - imageY) / imageHeight)
      }
    },
    [imageHeight, imageWidth, imageX, imageY, maskOverlay]
  )

  const handlePointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isPaintTarget) {
        return
      }

      const point = toNormalizedPoint(event)
      if (!point) {
        return
      }

      drawingRef.current = true
      draftPointsRef.current = [point]
      event.currentTarget.setPointerCapture(event.pointerId)
      redraw()
    },
    [isPaintTarget, redraw, toNormalizedPoint]
  )

  const commitStroke = React.useCallback(() => {
    if (!drawingRef.current) {
      return
    }

    drawingRef.current = false
    const points = draftPointsRef.current
    draftPointsRef.current = []

    if (points.length > 0) {
      addStroke(points)
    }

    redraw()
  }, [addStroke, redraw])

  const handlePointerMove = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isPaintTarget) {
        return
      }

      if (!maskOverlay) {
        return
      }

      const targetRect = event.currentTarget.getBoundingClientRect()
      const localX = event.clientX - targetRect.left
      const localY = event.clientY - targetRect.top

      const insideImage =
        localX >= imageX &&
        localY >= imageY &&
        localX <= imageX + imageWidth &&
        localY <= imageY + imageHeight

      setCursor(
        insideImage
          ? {
              x: localX,
              y: localY
            }
          : null
      )

      if (!drawingRef.current) {
        return
      }

      const point = toNormalizedPoint(event)
      if (!point) {
        return
      }

      draftPointsRef.current.push(point)
      redraw()
    },
    [imageHeight, imageWidth, imageX, imageY, isPaintTarget, maskOverlay, redraw, toNormalizedPoint]
  )

  const handlePointerUp = React.useCallback(() => {
    commitStroke()
  }, [commitStroke])

  React.useEffect(() => {
    if (!isPaintTarget) {
      drawingRef.current = false
      draftPointsRef.current = []
      setCursor(null)
    }
  }, [isPaintTarget])

  if (!isPaintTarget || !maskOverlay) {
    return null
  }

  return (
    <div
      ref={wrapperRef}
      className="absolute inset-0 z-40"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={() => {
        setCursor(null)
        commitStroke()
      }}
      style={{ cursor: 'none' }}
    >
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0" />
      {cursor && (
        <div
          className="pointer-events-none absolute rounded-full border border-white/80 bg-white/10"
          style={{
            width: brushSizeNormalized * imageWidth,
            height: brushSizeNormalized * imageWidth,
            left: cursor.x - (brushSizeNormalized * imageWidth) / 2,
            top: cursor.y - (brushSizeNormalized * imageWidth) / 2
          }}
        />
      )}
    </div>
  )
}
