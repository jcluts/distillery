import * as fs from 'fs'
import * as path from 'path'
import sharp from 'sharp'
import type { RemovalOperation, RemovalProgressEvent } from '../types'
import { LamaInference } from './lama-inference'

const MODEL_SIZE = 512

interface BoundingBox {
  x1: number
  y1: number
  x2: number
  y2: number
}

interface CropRegion {
  x: number
  y: number
  w: number
  h: number
}

interface ProcessRemovalArgs {
  sourcePath: string
  outputPath: string
  operation: RemovalOperation
  inference: LamaInference
  onProgress?: (phase: RemovalProgressEvent['phase'], message?: string) => void
}

interface ProcessRemovalResult {
  width: number
  height: number
}

function maskBoundingBox(mask: Buffer, width: number, height: number): BoundingBox | null {
  let x1 = width
  let y1 = height
  let x2 = -1
  let y2 = -1

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (mask[y * width + x] === 0) {
        continue
      }

      if (x < x1) x1 = x
      if (y < y1) y1 = y
      if (x > x2) x2 = x
      if (y > y2) y2 = y
    }
  }

  if (x2 < 0 || y2 < 0) {
    return null
  }

  return { x1, y1, x2, y2 }
}

function calculateCrop(bounds: BoundingBox, width: number, height: number): CropRegion {
  const maskWidth = bounds.x2 - bounds.x1 + 1
  const maskHeight = bounds.y2 - bounds.y1 + 1

  const targetWidth = Math.min(width, Math.max(MODEL_SIZE, Math.round(maskWidth * 3)))
  const targetHeight = Math.min(height, Math.max(MODEL_SIZE, Math.round(maskHeight * 3)))

  const centerX = bounds.x1 + maskWidth / 2
  const centerY = bounds.y1 + maskHeight / 2

  let x = Math.round(centerX - targetWidth / 2)
  let y = Math.round(centerY - targetHeight / 2)

  x = Math.max(0, Math.min(x, width - targetWidth))
  y = Math.max(0, Math.min(y, height - targetHeight))

  return { x, y, w: targetWidth, h: targetHeight }
}

function extractMaskCrop(
  input: Buffer,
  sourceWidth: number,
  cropX: number,
  cropY: number,
  cropWidth: number,
  cropHeight: number
): Buffer {
  const output = Buffer.alloc(cropWidth * cropHeight)

  for (let y = 0; y < cropHeight; y += 1) {
    const srcRow = (cropY + y) * sourceWidth
    const dstRow = y * cropWidth
    for (let x = 0; x < cropWidth; x += 1) {
      output[dstRow + x] = input[srcRow + cropX + x]
    }
  }

  return output
}

function clamp01(value: number): number {
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

function toMaskSvg(operation: RemovalOperation, width: number, height: number): string {
  const segments: string[] = []

  for (const stroke of operation.strokes) {
    if (stroke.points.length === 0) {
      continue
    }

    const color = stroke.erasing ? 'black' : 'white'
    const brushSizePx = Math.max(1, Math.round(stroke.brushSizeNormalized * width))

    if (stroke.points.length === 1) {
      const point = stroke.points[0]
      const cx = clamp01(point.x) * width
      const cy = clamp01(point.y) * height
      const radius = brushSizePx / 2
      segments.push(`<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${color}" />`)
      continue
    }

    const pathParts: string[] = []
    stroke.points.forEach((point, index) => {
      const x = clamp01(point.x) * width
      const y = clamp01(point.y) * height
      pathParts.push(`${index === 0 ? 'M' : 'L'} ${x} ${y}`)
    })

    const d = pathParts.join(' ')
    segments.push(
      `<path d="${d}" stroke="${color}" stroke-width="${brushSizePx}" stroke-linecap="round" stroke-linejoin="round" fill="none" />`
    )
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect x="0" y="0" width="${width}" height="${height}" fill="black" />
  ${segments.join('\n  ')}
</svg>`
}

async function rasterizeMask(operation: RemovalOperation, width: number, height: number): Promise<Buffer> {
  const svg = toMaskSvg(operation, width, height)
  return await sharp(Buffer.from(svg))
    .resize(width, height, { fit: 'fill', kernel: sharp.kernel.nearest })
    .greyscale()
    .raw()
    .toBuffer()
}

async function featherMask(mask: Buffer, width: number, height: number, featherRadiusPx: number): Promise<Buffer> {
  if (featherRadiusPx <= 0) {
    return mask
  }

  const blurRadius = Math.max(0.3, featherRadiusPx / 2)
  return await sharp(mask, { raw: { width, height, channels: 1 } })
    .blur(blurRadius)
    .greyscale()
    .raw()
    .toBuffer()
}

export async function processRemoval(args: ProcessRemovalArgs): Promise<ProcessRemovalResult> {
  const { sourcePath, outputPath, operation, inference, onProgress } = args

  onProgress?.('preparing', 'Loading source image')

  const metadata = await sharp(sourcePath).rotate().metadata()
  const width = metadata.width ?? 0
  const height = metadata.height ?? 0

  if (width <= 0 || height <= 0) {
    throw new Error(`Invalid source dimensions: ${sourcePath}`)
  }

  onProgress?.('rasterizing', 'Rasterizing mask')
  const mask = await rasterizeMask(operation, width, height)
  const bounds = maskBoundingBox(mask, width, height)

  if (!bounds) {
    await fs.promises.mkdir(path.dirname(outputPath), { recursive: true })
    await sharp(sourcePath).rotate().jpeg({ quality: 95 }).toFile(outputPath)
    return { width, height }
  }

  const featherPx = Math.max(0, Math.round(operation.featherRadiusNormalized * width))
  const featheredMask = await featherMask(mask, width, height, featherPx)
  const crop = calculateCrop(bounds, width, height)

  const sourceRaw = await sharp(sourcePath).rotate().removeAlpha().raw().toBuffer()
  const sourceCrop = await sharp(sourceRaw, { raw: { width, height, channels: 3 } })
    .extract({ left: crop.x, top: crop.y, width: crop.w, height: crop.h })
    .raw()
    .toBuffer()

  const maskCrop = extractMaskCrop(mask, width, crop.x, crop.y, crop.w, crop.h)
  const featherCrop = extractMaskCrop(featheredMask, width, crop.x, crop.y, crop.w, crop.h)

  const modelInputImage = await sharp(sourceCrop, { raw: { width: crop.w, height: crop.h, channels: 3 } })
    .resize(MODEL_SIZE, MODEL_SIZE, { fit: 'fill' })
    .raw()
    .toBuffer()

  const modelInputMask = await sharp(maskCrop, { raw: { width: crop.w, height: crop.h, channels: 1 } })
    .resize(MODEL_SIZE, MODEL_SIZE, { fit: 'fill', kernel: sharp.kernel.nearest })
    .threshold(1)
    .greyscale()
    .raw()
    .toBuffer()

  onProgress?.('inferring', 'Running LaMa inpainting')
  const modelOutput = await inference.infer(modelInputImage, modelInputMask, MODEL_SIZE, MODEL_SIZE)

  const resizedOutput = await sharp(modelOutput, {
    raw: { width: MODEL_SIZE, height: MODEL_SIZE, channels: 3 }
  })
    .resize(crop.w, crop.h, { fit: 'fill' })
    .raw()
    .toBuffer()

  onProgress?.('blending', 'Blending inpainted region')

  const blended = Buffer.from(sourceRaw)
  const fullStride = width * 3
  const cropStride = crop.w * 3

  for (let y = 0; y < crop.h; y += 1) {
    for (let x = 0; x < crop.w; x += 1) {
      const alpha = featherCrop[y * crop.w + x] / 255
      if (alpha <= 0) {
        continue
      }

      const srcIndex = y * cropStride + x * 3
      const dstIndex = (crop.y + y) * fullStride + (crop.x + x) * 3

      blended[dstIndex] = Math.round(resizedOutput[srcIndex] * alpha + blended[dstIndex] * (1 - alpha))
      blended[dstIndex + 1] = Math.round(
        resizedOutput[srcIndex + 1] * alpha + blended[dstIndex + 1] * (1 - alpha)
      )
      blended[dstIndex + 2] = Math.round(
        resizedOutput[srcIndex + 2] * alpha + blended[dstIndex + 2] * (1 - alpha)
      )
    }
  }

  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true })
  await sharp(blended, { raw: { width, height, channels: 3 } }).jpeg({ quality: 95 }).toFile(outputPath)

  return { width, height }
}
