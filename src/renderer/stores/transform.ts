import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import type { ImageTransforms, NormalizedCropRect } from '@/types'
import { useLibraryStore } from '@/stores/library'
import { useUIStore } from '@/stores/ui'
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

export interface CropOverlayLayout {
  containerWidth: number
  containerHeight: number
  imageX: number
  imageY: number
  imageWidth: number
  imageHeight: number
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

export const useTransformStore = defineStore('transform', () => {
  // Per-media transforms cache
  const transforms = ref<Record<string, ImageTransforms | null>>({})
  const loaded = ref<Record<string, boolean>>({})

  // Crop mode state
  const cropMode = ref(false)
  const cropMediaId = ref<string | null>(null)
  const pendingCrop = ref<NormalizedCropRect | null>(null)
  const cropAspectRatio = ref<string | null>(null)
  const cropOverlay = ref<CropOverlayLayout | null>(null)
  const cropGuide = ref<CropGuideMode>('thirds')

  // Computed: get transforms for a specific media ID
  function getTransformsFor(mediaId: string | null): ImageTransforms | null {
    if (!mediaId) return null
    return transforms.value[mediaId] ?? null
  }

  // Whether a given media item is the active crop target
  const isCropTarget = computed(
    () => (mediaId: string | null) => cropMode.value && cropMediaId.value === mediaId
  )

  function getLocalTransforms(mediaId: string): ImageTransforms {
    return cloneTransforms(transforms.value[mediaId] ?? null)
  }

  async function loadTransforms(mediaId: string): Promise<void> {
    if (!mediaId || loaded.value[mediaId]) return

    try {
      const result = await window.api.transforms.get(mediaId)
      transforms.value[mediaId] = result ?? null
      loaded.value[mediaId] = true
    } catch {
      loaded.value[mediaId] = true
    }
  }

  async function saveTransforms(
    mediaId: string,
    value: ImageTransforms | null
  ): Promise<void> {
    const persisted = toPersistedTransforms(value)

    // Optimistic update
    transforms.value[mediaId] = persisted
    loaded.value[mediaId] = true

    try {
      await window.api.transforms.save(mediaId, persisted)
    } catch {
      // Keep local state optimistic; renderer will reconcile on next load.
    }
  }

  async function rotate(mediaId: string, direction: 'cw' | 'ccw'): Promise<void> {
    await loadTransforms(mediaId)
    const current = getLocalTransforms(mediaId)
    const next: ImageTransforms = {
      ...current,
      rotation:
        direction === 'cw'
          ? nextRotationCW(current.rotation)
          : nextRotationCCW(current.rotation),
      crop:
        direction === 'cw'
          ? rotateCropCW(current.crop)
          : rotateCropCCW(current.crop)
    }
    await saveTransforms(mediaId, next)
  }

  async function flipH(mediaId: string): Promise<void> {
    await loadTransforms(mediaId)
    const current = getLocalTransforms(mediaId)
    const next: ImageTransforms = {
      ...current,
      flip_h: !current.flip_h,
      crop: flipCropH(current.crop)
    }
    await saveTransforms(mediaId, next)
  }

  async function flipV(mediaId: string): Promise<void> {
    await loadTransforms(mediaId)
    const current = getLocalTransforms(mediaId)
    const next: ImageTransforms = {
      ...current,
      flip_v: !current.flip_v,
      crop: flipCropV(current.crop)
    }
    await saveTransforms(mediaId, next)
  }

  async function enterCropMode(): Promise<void> {
    const uiStore = useUIStore()
    const libraryStore = useLibraryStore()

    if (uiStore.viewMode !== 'loupe') return

    const focusedId = libraryStore.focusedId
    const focusedItem = focusedId
      ? libraryStore.items.find((item) => item.id === focusedId) ?? null
      : null

    if (!focusedItem || focusedItem.media_type !== 'image') return

    await loadTransforms(focusedItem.id)
    const existing = transforms.value[focusedItem.id] ?? null
    const aspectToken = existing?.aspect_ratio ?? null
    const pending =
      normalizeCrop(existing?.crop ?? null) ?? defaultCrop(aspectToken)

    cropMode.value = true
    cropMediaId.value = focusedItem.id
    pendingCrop.value = pending
    cropAspectRatio.value = aspectToken
    cropOverlay.value = null
  }

  function setPendingCrop(crop: NormalizedCropRect | null): void {
    pendingCrop.value = normalizeCrop(crop)
  }

  function setCropAspectRatio(value: string | null): void {
    const nextToken = value === 'free' ? null : value
    const ratio = parseAspectRatio(nextToken)

    if (!cropMode.value || !ratio) {
      cropAspectRatio.value = nextToken
      return
    }

    const current = pendingCrop.value ?? defaultCrop(nextToken)
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

    cropAspectRatio.value = nextToken
    pendingCrop.value = normalizeCrop({ x, y, w: width, h: height })
  }

  function setCropGuide(guide: CropGuideMode): void {
    cropGuide.value = guide
  }

  function setCropOverlay(overlay: CropOverlayLayout | null): void {
    cropOverlay.value = overlay
  }

  async function applyCrop(): Promise<void> {
    if (!cropMode.value || !cropMediaId.value) return

    const crop = normalizeCrop(pendingCrop.value)
    if (!crop) return

    const current = getLocalTransforms(cropMediaId.value)
    const next: ImageTransforms = {
      ...current,
      crop,
      aspect_ratio: cropAspectRatio.value
    }

    await saveTransforms(cropMediaId.value, next)

    cropMode.value = false
    cropMediaId.value = null
    pendingCrop.value = null
    cropOverlay.value = null
  }

  function cancelCrop(): void {
    cropMode.value = false
    cropMediaId.value = null
    pendingCrop.value = null
    cropOverlay.value = null
  }

  async function resetAll(mediaId: string): Promise<void> {
    await saveTransforms(mediaId, null)

    if (cropMediaId.value === mediaId) {
      cropMode.value = false
      cropMediaId.value = null
      pendingCrop.value = null
      cropAspectRatio.value = null
      cropOverlay.value = null
    }
  }

  return {
    transforms,
    loaded,
    cropMode,
    cropMediaId,
    pendingCrop,
    cropAspectRatio,
    cropOverlay,
    cropGuide,
    isCropTarget,
    getTransformsFor,
    loadTransforms,
    saveTransforms,
    rotate,
    flipH,
    flipV,
    enterCropMode,
    setPendingCrop,
    setCropAspectRatio,
    setCropGuide,
    setCropOverlay,
    applyCrop,
    cancelCrop,
    resetAll
  }
})
