import * as React from 'react'

import { normalizeCrop } from '@/lib/transform-math'
import { useTransformStore } from '@/stores/transform-store'
import type { ZoomLevel } from '@/stores/ui-store'
import type { ImageTransforms, MediaRecord } from '@/types'

async function loadImage(url: string): Promise<HTMLImageElement> {
  const img = new Image()
  img.src = url
  await img.decode()
  return img
}

interface DrawOptions {
  ctx: CanvasRenderingContext2D
  width: number
  height: number
  img: HTMLImageElement | null
  media: MediaRecord | null
  zoom: ZoomLevel
  panOffset: { x: number; y: number }
  transforms: ImageTransforms | null
  suppressCrop: boolean
}

interface DrawResult {
  imageRect: { x: number; y: number; w: number; h: number } | null
  pannable: boolean
}

function getRotatedDimensions(
  width: number,
  height: number,
  rotation: ImageTransforms['rotation']
): { width: number; height: number } {
  if (rotation === 90 || rotation === 270) {
    return { width: height, height: width }
  }

  return { width, height }
}

function draw({
  ctx,
  width,
  height,
  img,
  media,
  zoom,
  panOffset,
  transforms,
  suppressCrop
}: DrawOptions): DrawResult {
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = 'rgba(0,0,0,0)'
  ctx.fillRect(0, 0, width, height)

  if (!img || !media) {
    ctx.fillStyle = 'rgba(255,255,255,0.06)'
    ctx.fillRect(0, 0, width, height)
    ctx.fillStyle = 'rgba(255,255,255,0.65)'
    ctx.font = '13px Inter, ui-sans-serif, system-ui, sans-serif'
    ctx.fillText(media ? media.file_name : 'No selection', 20, 34)
    return { imageRect: null, pannable: false }
  }

  const iw = img.naturalWidth || img.width
  const ih = img.naturalHeight || img.height
  if (!iw || !ih) return { imageRect: null, pannable: false }

  const active = transforms ?? {
    rotation: 0,
    flip_h: false,
    flip_v: false,
    crop: null,
    aspect_ratio: null
  }

  const rotated = getRotatedDimensions(iw, ih, active.rotation)

  const transformedCanvas = document.createElement('canvas')
  transformedCanvas.width = Math.max(1, Math.round(rotated.width))
  transformedCanvas.height = Math.max(1, Math.round(rotated.height))

  const transformedCtx = transformedCanvas.getContext('2d')
  if (!transformedCtx) {
    return { imageRect: null, pannable: false }
  }

  transformedCtx.imageSmoothingEnabled = true
  transformedCtx.imageSmoothingQuality = 'high'
  transformedCtx.translate(rotated.width / 2, rotated.height / 2)
  transformedCtx.rotate((active.rotation * Math.PI) / 180)
  transformedCtx.scale(active.flip_h ? -1 : 1, active.flip_v ? -1 : 1)
  transformedCtx.drawImage(img, -iw / 2, -ih / 2, iw, ih)

  const crop = suppressCrop ? null : normalizeCrop(active.crop)

  const sx = crop ? Math.floor(crop.x * rotated.width) : 0
  const sy = crop ? Math.floor(crop.y * rotated.height) : 0
  const sw = crop
    ? Math.max(1, Math.min(rotated.width - sx, Math.round(crop.w * rotated.width)))
    : rotated.width
  const sh = crop
    ? Math.max(1, Math.min(rotated.height - sy, Math.round(crop.h * rotated.height)))
    : rotated.height

  const effectiveWidth = sw
  const effectiveHeight = sh

  const scale = zoom === 'actual' ? 1.0 : Math.min(width / effectiveWidth, height / effectiveHeight)
  const dw = effectiveWidth * scale
  const dh = effectiveHeight * scale

  const overflowX = Math.max(0, dw - width)
  const overflowY = Math.max(0, dh - height)
  const clampedPanX =
    overflowX > 0 ? Math.max(-overflowX / 2, Math.min(overflowX / 2, panOffset.x)) : 0
  const clampedPanY =
    overflowY > 0 ? Math.max(-overflowY / 2, Math.min(overflowY / 2, panOffset.y)) : 0

  const dx = (width - dw) / 2 + clampedPanX
  const dy = (height - dh) / 2 + clampedPanY

  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(transformedCanvas, sx, sy, sw, sh, dx, dy, dw, dh)

  return {
    imageRect: { x: dx, y: dy, w: dw, h: dh },
    pannable: dw > width || dh > height
  }
}

interface CanvasViewerProps {
  media: MediaRecord | null
  zoom?: ZoomLevel
}

export function CanvasViewer({ media, zoom = 'fit' }: CanvasViewerProps): React.JSX.Element {
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null)
  const imageRef = React.useRef<HTMLImageElement | null>(null)

  const transforms = useTransformStore((s) => (media ? s.transforms[media.id] ?? null : null))
  const loadTransforms = useTransformStore((s) => s.loadTransforms)
  const cropMode = useTransformStore((s) => s.cropMode)
  const cropMediaId = useTransformStore((s) => s.cropMediaId)
  const setCropOverlay = useTransformStore((s) => s.setCropOverlay)

  // Pan state (local refs, not in store)
  const panOffset = React.useRef({ x: 0, y: 0 })
  const isDragging = React.useRef(false)
  const dragStart = React.useRef({ x: 0, y: 0 })
  const dragStartOffset = React.useRef({ x: 0, y: 0 })

  // Track whether image overflows viewport for cursor styling
  const [isPannable, setIsPannable] = React.useState(false)
  const [dragging, setDragging] = React.useState(false)

  const isCropTarget = cropMode && cropMediaId === media?.id

  // Derive the image URL: working_file_path (active upscale variant) or original file_path
  const imageUrl = media?.working_file_path ?? media?.file_path ?? null

  React.useEffect(() => {
    if (media?.id && media.media_type === 'image') {
      void loadTransforms(media.id)
    }
  }, [loadTransforms, media?.id, media?.media_type])

  // Reset pan when zoom, transforms, crop mode, or image changes
  React.useEffect(() => {
    panOffset.current = { x: 0, y: 0 }
  }, [zoom, imageUrl, transforms, isCropTarget])

  // Helper to redraw
  const redraw = React.useCallback(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const rect = container.getBoundingClientRect()
    const result = draw({
      ctx,
      width: rect.width,
      height: rect.height,
      img: imageRef.current,
      media,
      zoom,
      panOffset: panOffset.current,
      transforms,
      suppressCrop: isCropTarget
    })

    setIsPannable(!isCropTarget && result.pannable)

    if (isCropTarget && result.imageRect) {
      setCropOverlay({
        containerWidth: rect.width,
        containerHeight: rect.height,
        imageX: result.imageRect.x,
        imageY: result.imageRect.y,
        imageWidth: result.imageRect.w,
        imageHeight: result.imageRect.h
      })
    } else {
      setCropOverlay(null)
    }
  }, [isCropTarget, media, setCropOverlay, transforms, zoom])

  // ResizeObserver
  React.useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const ro = new ResizeObserver(() => {
      const rect = container.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.max(1, Math.floor(rect.width * dpr))
      canvas.height = Math.max(1, Math.floor(rect.height * dpr))
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      redraw()
    })

    ro.observe(container)
    return () => ro.disconnect()
  }, [redraw])

  // Load image
  React.useEffect(() => {
    let cancelled = false

    const run = async (): Promise<void> => {
      const container = containerRef.current
      const canvas = canvasRef.current
      if (!container || !canvas) return

      if (!imageUrl) {
        imageRef.current = null
        redraw()
        return
      }

      try {
        const img = await loadImage(imageUrl)
        if (cancelled) return
        imageRef.current = img
        redraw()
      } catch {
        if (cancelled) return
        imageRef.current = null
        redraw()
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [imageUrl, redraw])

  // Redraw on state changes.
  React.useEffect(() => {
    redraw()
  }, [redraw])

  // Pan mouse handlers
  const onMouseDown = React.useCallback(
    (e: React.MouseEvent) => {
      if (!isPannable || isCropTarget) return
      isDragging.current = true
      dragStart.current = { x: e.clientX, y: e.clientY }
      dragStartOffset.current = { ...panOffset.current }
      setDragging(true)
    },
    [isCropTarget, isPannable]
  )

  const onMouseMove = React.useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging.current || isCropTarget) return
      const dx = e.clientX - dragStart.current.x
      const dy = e.clientY - dragStart.current.y
      panOffset.current = {
        x: dragStartOffset.current.x + dx,
        y: dragStartOffset.current.y + dy
      }
      redraw()
    },
    [isCropTarget, redraw]
  )

  const onMouseUp = React.useCallback(() => {
    isDragging.current = false
    setDragging(false)
  }, [])

  React.useEffect(() => {
    return () => {
      setCropOverlay(null)
    }
  }, [setCropOverlay])

  const cursor = isCropTarget ? 'crosshair' : isPannable ? (dragging ? 'grabbing' : 'grab') : 'default'

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      style={{ cursor }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  )
}
