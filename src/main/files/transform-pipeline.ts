import type sharp from 'sharp'

import type { ImageTransforms, NormalizedCropRect } from '../types'

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function normalizeCrop(crop: NormalizedCropRect | null): NormalizedCropRect | null {
  if (!crop) return null

  const x = clamp01(crop.x)
  const y = clamp01(crop.y)
  const maxW = 1 - x
  const maxH = 1 - y
  const w = Math.min(maxW, Math.max(0, clamp01(crop.w)))
  const h = Math.min(maxH, Math.max(0, clamp01(crop.h)))

  if (w <= 0 || h <= 0) return null
  return { x, y, w, h }
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

export function getTransformedDimensions(
  pixelW: number,
  pixelH: number,
  transforms: ImageTransforms | null,
  options?: { suppressCrop?: boolean }
): { width: number; height: number } {
  if (!transforms) {
    return {
      width: Math.max(1, pixelW),
      height: Math.max(1, pixelH)
    }
  }

  const rotated = getRotatedDimensions(pixelW, pixelH, transforms.rotation)
  if (options?.suppressCrop) {
    return {
      width: Math.max(1, rotated.width),
      height: Math.max(1, rotated.height)
    }
  }

  const crop = normalizeCrop(transforms.crop)
  if (!crop) {
    return {
      width: Math.max(1, rotated.width),
      height: Math.max(1, rotated.height)
    }
  }

  return {
    width: Math.max(1, Math.round(crop.w * rotated.width)),
    height: Math.max(1, Math.round(crop.h * rotated.height))
  }
}

export function applyTransforms(
  pipeline: sharp.Sharp,
  transforms: ImageTransforms | null,
  pixelW: number,
  pixelH: number
): sharp.Sharp {
  if (!transforms) {
    return pipeline
  }

  let nextPipeline = pipeline.rotate(transforms.rotation)

  if (transforms.flip_h) {
    nextPipeline = nextPipeline.flop()
  }

  if (transforms.flip_v) {
    nextPipeline = nextPipeline.flip()
  }

  const crop = normalizeCrop(transforms.crop)
  if (!crop) {
    return nextPipeline
  }

  const rotated = getRotatedDimensions(pixelW, pixelH, transforms.rotation)
  const rawLeft = Math.floor(crop.x * rotated.width)
  const rawTop = Math.floor(crop.y * rotated.height)
  const rawWidth = Math.max(1, Math.round(crop.w * rotated.width))
  const rawHeight = Math.max(1, Math.round(crop.h * rotated.height))

  const left = Math.max(0, Math.min(rawLeft, rotated.width - 1))
  const top = Math.max(0, Math.min(rawTop, rotated.height - 1))
  const width = Math.max(1, Math.min(rawWidth, rotated.width - left))
  const height = Math.max(1, Math.min(rawHeight, rotated.height - top))

  return nextPipeline.extract({ left, top, width, height })
}
