import type { ImageTransforms } from '@/types'
import { normalizeCrop } from '@/lib/transform-math'

export interface DrawOptions {
  ctx: CanvasRenderingContext2D
  width: number
  height: number
  img: HTMLImageElement | null
  adjustedSource?: HTMLCanvasElement | OffscreenCanvas | null
  media: { file_name: string } | null
  zoom: 'fit' | 'actual'
  panOffset: { x: number; y: number }
  transforms?: ImageTransforms | null
  suppressCrop?: boolean
  transformCanvas?: HTMLCanvasElement | OffscreenCanvas | null
}

export interface DrawResult {
  imageRect: { x: number; y: number; w: number; h: number } | null
  pannable: boolean
  clampedPanOffset: { x: number; y: number }
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

function getReusableCanvasContext(
  canvas: HTMLCanvasElement | OffscreenCanvas
): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null {
  return canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
}

export function draw({
  ctx,
  width,
  height,
  img,
  adjustedSource,
  media,
  zoom,
  panOffset,
  transforms,
  suppressCrop,
  transformCanvas
}: DrawOptions): DrawResult {
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

  const source = adjustedSource ?? img
  const iw = 'naturalWidth' in source ? source.naturalWidth || source.width : source.width
  const ih = 'naturalHeight' in source ? source.naturalHeight || source.height : source.height

  if (!iw || !ih || !width || !height) {
    return {
      imageRect: null,
      pannable: false,
      clampedPanOffset: { x: 0, y: 0 }
    }
  }

  const active: ImageTransforms = transforms ?? {
    rotation: 0,
    flip_h: false,
    flip_v: false,
    crop: null,
    aspect_ratio: null
  }

  const needsTransform = active.rotation !== 0 || active.flip_h || active.flip_v

  const rotated = getRotatedDimensions(iw, ih, active.rotation)

  let drawSource: HTMLImageElement | HTMLCanvasElement | OffscreenCanvas = source

  if (needsTransform) {
    const reusableCanvas = transformCanvas ?? document.createElement('canvas')
    reusableCanvas.width = Math.max(1, Math.round(rotated.width))
    reusableCanvas.height = Math.max(1, Math.round(rotated.height))

    const transformedCtx = getReusableCanvasContext(reusableCanvas)
    if (!transformedCtx) {
      return { imageRect: null, pannable: false, clampedPanOffset: { x: 0, y: 0 } }
    }

    transformedCtx.setTransform(1, 0, 0, 1, 0, 0)
    transformedCtx.clearRect(0, 0, reusableCanvas.width, reusableCanvas.height)
    transformedCtx.imageSmoothingEnabled = true
    transformedCtx.imageSmoothingQuality = 'high'
    transformedCtx.translate(rotated.width / 2, rotated.height / 2)
    transformedCtx.rotate((active.rotation * Math.PI) / 180)
    transformedCtx.scale(active.flip_h ? -1 : 1, active.flip_v ? -1 : 1)
    transformedCtx.drawImage(source, -iw / 2, -ih / 2, iw, ih)

    drawSource = reusableCanvas
  }

  // Extract crop region (suppressed during crop mode so full image is shown)
  const crop = suppressCrop ? null : normalizeCrop(active.crop)

  const sx = crop ? Math.floor(crop.x * rotated.width) : 0
  const sy = crop ? Math.floor(crop.y * rotated.height) : 0
  const sw = crop
    ? Math.max(1, Math.min(rotated.width - sx, Math.round(crop.w * rotated.width)))
    : rotated.width
  const sh = crop
    ? Math.max(1, Math.min(rotated.height - sy, Math.round(crop.h * rotated.height)))
    : rotated.height

  const scale = zoom === 'actual' ? 1.0 : Math.min(width / sw, height / sh)
  const dw = sw * scale
  const dh = sh * scale

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
  ctx.drawImage(drawSource, sx, sy, sw, sh, dx, dy, dw, dh)

  return {
    imageRect: { x: dx, y: dy, w: dw, h: dh },
    pannable: dw > width || dh > height,
    clampedPanOffset: { x: clampedPanX, y: clampedPanY }
  }
}