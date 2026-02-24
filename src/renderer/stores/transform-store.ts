import { create } from 'zustand'

import type { ImageTransforms, NormalizedCropRect } from '@/types'
import { useLibraryStore } from '@/stores/library-store'
import { useUIStore } from '@/stores/ui-store'
import {
  cloneTransforms,
  flipCropH,
  flipCropV,
  isDefaultTransforms,
  nextRotationCCW,
  nextRotationCW,
  normalizeCrop,
  parseAspectRatio,
  rotateCropCCW,
  rotateCropCW,
  type CropGuideMode
} from '@/lib/transform-math'

interface CropOverlayLayout {
  containerWidth: number
  containerHeight: number
  imageX: number
  imageY: number
  imageWidth: number
  imageHeight: number
}

interface TransformState {
  transforms: Record<string, ImageTransforms | null>
  loaded: Record<string, boolean>

  cropMode: boolean
  cropMediaId: string | null
  pendingCrop: NormalizedCropRect | null
  cropAspectRatio: string | null
  cropOverlay: CropOverlayLayout | null
  cropGuide: CropGuideMode

  loadTransforms: (mediaId: string) => Promise<void>
  saveTransforms: (mediaId: string, transforms: ImageTransforms | null) => Promise<void>

  rotate: (mediaId: string, direction: 'cw' | 'ccw') => Promise<void>
  flipH: (mediaId: string) => Promise<void>
  flipV: (mediaId: string) => Promise<void>

  enterCropMode: () => Promise<void>
  setPendingCrop: (crop: NormalizedCropRect | null) => void
  setCropAspectRatio: (value: string | null) => void
  setCropGuide: (guide: CropGuideMode) => void
  setCropOverlay: (overlay: CropOverlayLayout | null) => void
  applyCrop: () => Promise<void>
  cancelCrop: () => void
  resetAll: (mediaId: string) => Promise<void>
}

function defaultCrop(aspectRatioToken: string | null): NormalizedCropRect {
  const ratio = parseAspectRatio(aspectRatioToken)
  if (!ratio) {
    return { x: 0.1, y: 0.1, w: 0.8, h: 0.8 }
  }

  let w = 0.9
  let h = w / ratio
  if (h > 0.9) {
    h = 0.9
    w = h * ratio
  }

  return {
    x: (1 - w) / 2,
    y: (1 - h) / 2,
    w,
    h
  }
}

function toPersistedTransforms(value: ImageTransforms | null): ImageTransforms | null {
  if (!value) return null
  const normalized: ImageTransforms = {
    rotation: value.rotation,
    flip_h: value.flip_h,
    flip_v: value.flip_v,
    crop: normalizeCrop(value.crop),
    aspect_ratio: value.aspect_ratio
  }

  return isDefaultTransforms(normalized) ? null : normalized
}

function getLocalTransforms(state: TransformState, mediaId: string): ImageTransforms {
  return cloneTransforms(state.transforms[mediaId] ?? null)
}

export const useTransformStore = create<TransformState>((set, get) => ({
  transforms: {},
  loaded: {},

  cropMode: false,
  cropMediaId: null,
  pendingCrop: null,
  cropAspectRatio: null,
  cropOverlay: null,
  cropGuide: 'thirds',

  loadTransforms: async (mediaId) => {
    if (!mediaId || get().loaded[mediaId]) {
      return
    }

    try {
      const transforms = await window.api.transforms.get(mediaId)
      set((state) => ({
        transforms: { ...state.transforms, [mediaId]: transforms ?? null },
        loaded: { ...state.loaded, [mediaId]: true }
      }))
    } catch {
      set((state) => ({ loaded: { ...state.loaded, [mediaId]: true } }))
    }
  },

  saveTransforms: async (mediaId, transforms) => {
    const persisted = toPersistedTransforms(transforms)

    set((state) => ({
      transforms: { ...state.transforms, [mediaId]: persisted },
      loaded: { ...state.loaded, [mediaId]: true }
    }))

    try {
      await window.api.transforms.save(mediaId, persisted)
    } catch {
      // Keep local state optimistic; renderer will reconcile on next load.
    }
  },

  rotate: async (mediaId, direction) => {
    await get().loadTransforms(mediaId)
    const current = getLocalTransforms(get(), mediaId)
    const next: ImageTransforms = {
      ...current,
      rotation: direction === 'cw' ? nextRotationCW(current.rotation) : nextRotationCCW(current.rotation),
      crop: direction === 'cw' ? rotateCropCW(current.crop) : rotateCropCCW(current.crop)
    }
    await get().saveTransforms(mediaId, next)
  },

  flipH: async (mediaId) => {
    await get().loadTransforms(mediaId)
    const current = getLocalTransforms(get(), mediaId)
    const next: ImageTransforms = {
      ...current,
      flip_h: !current.flip_h,
      crop: flipCropH(current.crop)
    }
    await get().saveTransforms(mediaId, next)
  },

  flipV: async (mediaId) => {
    await get().loadTransforms(mediaId)
    const current = getLocalTransforms(get(), mediaId)
    const next: ImageTransforms = {
      ...current,
      flip_v: !current.flip_v,
      crop: flipCropV(current.crop)
    }
    await get().saveTransforms(mediaId, next)
  },

  enterCropMode: async () => {
    const { viewMode } = useUIStore.getState()
    const focusedId = useLibraryStore.getState().focusedId
    const focusedItem = focusedId
      ? useLibraryStore.getState().items.find((item) => item.id === focusedId) ?? null
      : null

    if (viewMode !== 'loupe' || !focusedItem || focusedItem.media_type !== 'image') {
      return
    }

    await get().loadTransforms(focusedItem.id)
    const transforms = get().transforms[focusedItem.id] ?? null
    const cropAspectRatio = transforms?.aspect_ratio ?? null
    const pendingCrop = normalizeCrop(transforms?.crop ?? null) ?? defaultCrop(cropAspectRatio)

    set({
      cropMode: true,
      cropMediaId: focusedItem.id,
      pendingCrop,
      cropAspectRatio,
      cropOverlay: null
    })
  },

  setPendingCrop: (crop) => {
    set({ pendingCrop: normalizeCrop(crop) })
  },

  setCropAspectRatio: (value) => {
    const nextToken = value === 'free' ? null : value
    const ratio = parseAspectRatio(nextToken)

    set((state) => {
      if (!state.cropMode) {
        return { cropAspectRatio: nextToken }
      }

      if (!ratio) {
        return { cropAspectRatio: nextToken }
      }

      const current = state.pendingCrop ?? defaultCrop(nextToken)
      const centerX = current.x + current.w / 2
      const centerY = current.y + current.h / 2

      let width = current.w
      let height = width / ratio

      if (height > current.h) {
        height = current.h
        width = height * ratio
      }

      if (width > 1 || height > 1) {
        const scale = Math.min(1 / width, 1 / height)
        width *= scale
        height *= scale
      }

      let x = centerX - width / 2
      let y = centerY - height / 2

      x = Math.min(1 - width, Math.max(0, x))
      y = Math.min(1 - height, Math.max(0, y))

      return {
        cropAspectRatio: nextToken,
        pendingCrop: normalizeCrop({ x, y, w: width, h: height })
      }
    })
  },

  setCropGuide: (guide) => {
    set({ cropGuide: guide })
  },

  setCropOverlay: (overlay) => {
    set({ cropOverlay: overlay })
  },

  applyCrop: async () => {
    const state = get()
    if (!state.cropMode || !state.cropMediaId) {
      return
    }

    const crop = normalizeCrop(state.pendingCrop)
    if (!crop) {
      return
    }

    const current = getLocalTransforms(state, state.cropMediaId)
    const next: ImageTransforms = {
      ...current,
      crop,
      aspect_ratio: state.cropAspectRatio
    }

    await state.saveTransforms(state.cropMediaId, next)

    set({
      cropMode: false,
      cropMediaId: null,
      pendingCrop: null,
      cropOverlay: null
    })
  },

  cancelCrop: () => {
    set({
      cropMode: false,
      cropMediaId: null,
      pendingCrop: null,
      cropOverlay: null
    })
  },

  resetAll: async (mediaId) => {
    await get().saveTransforms(mediaId, null)

    set((state) => {
      if (state.cropMediaId !== mediaId) {
        return {}
      }

      return {
        cropMode: false,
        cropMediaId: null,
        pendingCrop: null,
        cropAspectRatio: null,
        cropOverlay: null
      }
    })
  }
}))

export type { CropOverlayLayout }
