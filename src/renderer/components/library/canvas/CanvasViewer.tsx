import * as React from 'react'

import type { MediaRecord } from '@/types'

async function loadImage(url: string): Promise<HTMLImageElement> {
  const img = new Image()
  img.src = url
  await img.decode()
  return img
}

function draw(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  img: HTMLImageElement | null,
  media: MediaRecord | null
): void {
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = 'rgba(0,0,0,0)'
  ctx.fillRect(0, 0, width, height)

  if (!img || !media) {
    // Simple empty state
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

  const scale = Math.min(width / iw, height / ih)
  const dw = iw * scale
  const dh = ih * scale
  const dx = (width - dw) / 2
  const dy = (height - dh) / 2

  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, dx, dy, dw, dh)
}

export function CanvasViewer({ media }: { media: MediaRecord | null }): React.JSX.Element {
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null)
  const imageRef = React.useRef<HTMLImageElement | null>(null)

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
      draw(ctx, rect.width, rect.height, imageRef.current, media)
    })

    ro.observe(container)
    return () => ro.disconnect()
  }, [media])

  React.useEffect(() => {
    let cancelled = false

    const run = async (): Promise<void> => {
      const container = containerRef.current
      const canvas = canvasRef.current
      if (!container || !canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      if (!media?.file_path) {
        imageRef.current = null
        const rect = container.getBoundingClientRect()
        draw(ctx, rect.width, rect.height, null, media)
        return
      }

      try {
        const img = await loadImage(media.file_path)
        if (cancelled) return
        imageRef.current = img
        const rect = container.getBoundingClientRect()
        draw(ctx, rect.width, rect.height, img, media)
      } catch {
        if (cancelled) return
        imageRef.current = null
        const rect = container.getBoundingClientRect()
        draw(ctx, rect.width, rect.height, null, media)
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [media?.file_path])

  return (
    <div ref={containerRef} className="h-full w-full">
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  )
}
