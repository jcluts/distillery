import type { ImageTransforms, NormalizedCropRect } from '@/types'

export type CropGuideMode = 'thirds' | 'grid' | 'golden'

export const DEFAULT_TRANSFORMS: ImageTransforms = {
  rotation: 0,
  flip_h: false,
  flip_v: false,
  crop: null,
  aspect_ratio: null
}

export function cloneTransforms(transforms: ImageTransforms | null): ImageTransforms {
  if (!transforms) {
    return { ...DEFAULT_TRANSFORMS }
  }

  return {
    rotation: transforms.rotation,
    flip_h: transforms.flip_h,
    flip_v: transforms.flip_v,
    crop: transforms.crop ? { ...transforms.crop } : null,
    aspect_ratio: transforms.aspect_ratio
  }
}

export function normalizeCrop(crop: NormalizedCropRect | null): NormalizedCropRect | null {
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

export function rotateCropCW(crop: NormalizedCropRect | null): NormalizedCropRect | null {
  if (!crop) return null
  return normalizeCrop({ x: 1 - crop.y - crop.h, y: crop.x, w: crop.h, h: crop.w })
}

export function rotateCropCCW(crop: NormalizedCropRect | null): NormalizedCropRect | null {
  if (!crop) return null
  return normalizeCrop({ x: crop.y, y: 1 - crop.x - crop.w, w: crop.h, h: crop.w })
}

export function rotateCrop180(crop: NormalizedCropRect | null): NormalizedCropRect | null {
  if (!crop) return null
  return normalizeCrop({ x: 1 - crop.x - crop.w, y: 1 - crop.y - crop.h, w: crop.w, h: crop.h })
}

export function flipCropH(crop: NormalizedCropRect | null): NormalizedCropRect | null {
  if (!crop) return null
  return normalizeCrop({ x: 1 - crop.x - crop.w, y: crop.y, w: crop.w, h: crop.h })
}

export function flipCropV(crop: NormalizedCropRect | null): NormalizedCropRect | null {
  if (!crop) return null
  return normalizeCrop({ x: crop.x, y: 1 - crop.y - crop.h, w: crop.w, h: crop.h })
}

export function nextRotationCW(rotation: ImageTransforms['rotation']): ImageTransforms['rotation'] {
  return ((rotation + 90) % 360) as ImageTransforms['rotation']
}

export function nextRotationCCW(rotation: ImageTransforms['rotation']): ImageTransforms['rotation'] {
  return ((rotation + 270) % 360) as ImageTransforms['rotation']
}

export function isDefaultTransforms(transforms: ImageTransforms | null): boolean {
  if (!transforms) return true
  return (
    transforms.rotation === 0 &&
    !transforms.flip_h &&
    !transforms.flip_v &&
    transforms.crop === null &&
    transforms.aspect_ratio === null
  )
}

export function parseAspectRatio(value: string | null): number | null {
  if (!value || value === 'free') return null
  const parts = value.split(':')
  if (parts.length !== 2) return null
  const left = Number(parts[0])
  const right = Number(parts[1])
  if (!Number.isFinite(left) || !Number.isFinite(right) || left <= 0 || right <= 0) {
    return null
  }
  return left / right
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}
