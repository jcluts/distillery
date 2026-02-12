import * as React from 'react'

import type { MediaRecord } from '@/types'

function drawPlaceholder(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  media: MediaRecord | null
): void {
  ctx.clearRect(0, 0, width, height)

  ctx.fillStyle = 'rgba(255,255,255,0.03)'
  ctx.fillRect(0, 0, width, height)

  // Frame
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'
  ctx.lineWidth = 2
  ctx.strokeRect(16, 16, width - 32, height - 32)

  // Title
  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  ctx.font = '14px Inter, ui-sans-serif, system-ui, sans-serif'
  const title = media ? media.file_name : 'No selection'
  ctx.fillText(title, 28, 44)

  // Metadata
  ctx.fillStyle = 'rgba(255,255,255,0.45)'
  ctx.font = '12px Inter, ui-sans-serif, system-ui, sans-serif'
  if (media?.width && media?.height) {
    ctx.fillText(`${media.width} × ${media.height}`, 28, 64)
  }
  if (media?.origin) {
    ctx.fillText(`Origin: ${media.origin}`, 28, 84)
  }

  // Center mark
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'
  ctx.beginPath()
  ctx.moveTo(width / 2 - 16, height / 2)
  ctx.lineTo(width / 2 + 16, height / 2)
  ctx.moveTo(width / 2, height / 2 - 16)
  ctx.lineTo(width / 2, height / 2 + 16)
  ctx.stroke()
}

export function CanvasViewer({ media }: { media: MediaRecord | null }): React.JSX.Element {
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null)

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
      drawPlaceholder(ctx, rect.width, rect.height, media)
    })

    ro.observe(container)
    return () => ro.disconnect()
  }, [media])

  React.useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const rect = container.getBoundingClientRect()
    drawPlaceholder(ctx, rect.width, rect.height, media)
  }, [media])

  return (
    <div ref={containerRef} className="h-full w-full">
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  )
}
