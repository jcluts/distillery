export interface DrawOptions {
  ctx: CanvasRenderingContext2D
  width: number
  height: number
  img: HTMLImageElement | null
  media: { file_name: string } | null
  zoom: 'fit' | 'actual'
  panOffset: { x: number; y: number }
}

export interface DrawResult {
  imageRect: { x: number; y: number; w: number; h: number } | null
  pannable: boolean
  clampedPanOffset: { x: number; y: number }
}

export function draw({ ctx, width, height, img, media, zoom, panOffset }: DrawOptions): DrawResult {
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = 'rgba(0, 0, 0, 0)'
  ctx.fillRect(0, 0, width, height)

  if (!img || !media) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)'
    ctx.fillRect(0, 0, width, height)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.65)'
    ctx.font = '13px Inter, ui-sans-serif, system-ui, sans-serif'
    ctx.textBaseline = 'top'
    ctx.fillText(media?.file_name ?? 'No selection', 20, 20)

    return {
      imageRect: null,
      pannable: false,
      clampedPanOffset: { x: 0, y: 0 }
    }
  }

  const imageWidth = img.naturalWidth || img.width
  const imageHeight = img.naturalHeight || img.height

  if (!imageWidth || !imageHeight || !width || !height) {
    return {
      imageRect: null,
      pannable: false,
      clampedPanOffset: { x: 0, y: 0 }
    }
  }

  const scale =
    zoom === 'actual' ? 1 : Math.min(width / imageWidth, height / imageHeight)
  const drawnWidth = imageWidth * scale
  const drawnHeight = imageHeight * scale

  const overflowX = Math.max(0, drawnWidth - width)
  const overflowY = Math.max(0, drawnHeight - height)
  const clampedPanX =
    overflowX > 0 ? Math.max(-overflowX / 2, Math.min(overflowX / 2, panOffset.x)) : 0
  const clampedPanY =
    overflowY > 0 ? Math.max(-overflowY / 2, Math.min(overflowY / 2, panOffset.y)) : 0

  const drawX = (width - drawnWidth) / 2 + clampedPanX
  const drawY = (height - drawnHeight) / 2 + clampedPanY

  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, drawX, drawY, drawnWidth, drawnHeight)

  return {
    imageRect: { x: drawX, y: drawY, w: drawnWidth, h: drawnHeight },
    pannable: drawnWidth > width || drawnHeight > height,
    clampedPanOffset: { x: clampedPanX, y: clampedPanY }
  }
}