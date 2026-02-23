import * as React from 'react'

import type { ZoomLevel } from '@/stores/ui-store'
import type { MediaRecord } from '@/types'

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
}

function draw({ ctx, width, height, img, media, zoom, panOffset }: DrawOptions): void {
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = 'rgba(0,0,0,0)'
  ctx.fillRect(0, 0, width, height)

  if (!img || !media) {
    ctx.fillStyle = 'rgba(255,255,255,0.06)'
    ctx.fillRect(0, 0, width, height)
    ctx.fillStyle = 'rgba(255,255,255,0.65)'
    ctx.font = '13px Inter, ui-sans-serif, system-ui, sans-serif'
    ctx.fillText(media ? media.file_name : 'No selection', 20, 34)
    return
  }

  const iw = img.naturalWidth || img.width
  const ih = img.naturalHeight || img.height
  if (!iw || !ih) return

  let scale: number
  if (zoom === 'actual') {
    scale = 1.0
  } else {
    scale = Math.min(width / iw, height / ih)
  }

  const dw = iw * scale
  const dh = ih * scale

  // Clamp pan offset so image edge never leaves viewport
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
  ctx.drawImage(img, dx, dy, dw, dh)
}

interface CanvasViewerProps {
  media: MediaRecord | null
  zoom?: ZoomLevel
}

export function CanvasViewer({ media, zoom = 'fit' }: CanvasViewerProps): React.JSX.Element {
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null)
  const imageRef = React.useRef<HTMLImageElement | null>(null)

  // Pan state (local refs, not in store)
  const panOffset = React.useRef({ x: 0, y: 0 })
  const isDragging = React.useRef(false)
  const dragStart = React.useRef({ x: 0, y: 0 })
  const dragStartOffset = React.useRef({ x: 0, y: 0 })

  // Track whether image overflows viewport for cursor styling
  const [isPannable, setIsPannable] = React.useState(false)
  const [dragging, setDragging] = React.useState(false)

  // Derive the image URL: working_file_path (active upscale variant) or original file_path
  const imageUrl = media?.working_file_path ?? media?.file_path ?? null

  // Reset pan when zoom or image changes
  React.useEffect(() => {
    panOffset.current = { x: 0, y: 0 }
  }, [zoom, imageUrl])

  // Helper to redraw
  const redraw = React.useCallback(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const rect = container.getBoundingClientRect()
    draw({
      ctx,
      width: rect.width,
      height: rect.height,
      img: imageRef.current,
      media,
      zoom,
      panOffset: panOffset.current
    })

    // Update pannable state
    const img = imageRef.current
    if (img) {
      const iw = img.naturalWidth || img.width
      const ih = img.naturalHeight || img.height
      const scale = zoom === 'actual' ? 1.0 : Math.min(rect.width / iw, rect.height / ih)
      setIsPannable(iw * scale > rect.width || ih * scale > rect.height)
    } else {
      setIsPannable(false)
    }
  }, [media, zoom])

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
      const ctx = canvas.getContext('2d')
      if (!ctx) return

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

  // Redraw when zoom changes (pan already reset via separate effect)
  React.useEffect(() => {
    redraw()
  }, [zoom, redraw])

  // Pan mouse handlers
  const onMouseDown = React.useCallback(
    (e: React.MouseEvent) => {
      if (!isPannable) return
      isDragging.current = true
      dragStart.current = { x: e.clientX, y: e.clientY }
      dragStartOffset.current = { ...panOffset.current }
      setDragging(true)
    },
    [isPannable]
  )

  const onMouseMove = React.useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging.current) return
      const dx = e.clientX - dragStart.current.x
      const dy = e.clientY - dragStart.current.y
      panOffset.current = {
        x: dragStartOffset.current.x + dx,
        y: dragStartOffset.current.y + dy
      }
      redraw()
    },
    [redraw]
  )

  const onMouseUp = React.useCallback(() => {
    isDragging.current = false
    setDragging(false)
  }, [])

  const cursor = isPannable ? (dragging ? 'grabbing' : 'grab') : 'default'

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
