import { defineStore } from 'pinia'
import { ref } from 'vue'

import {
  cloneAdjustments,
  DEFAULT_IMAGE_ADJUSTMENTS,
  isDefaultAdjustments
} from '@/lib/adjustment-constants'
import type { ImageAdjustments } from '@/types'

function toPersistedAdjustments(
  adjustments: ImageAdjustments | null | undefined
): ImageAdjustments | null {
  if (!adjustments) return null

  const normalized = cloneAdjustments(adjustments)
  return isDefaultAdjustments(normalized) ? null : normalized
}

export const useAdjustmentStore = defineStore('adjustment', () => {
  const adjustments = ref<Record<string, ImageAdjustments | null>>({})
  const loaded = ref<Record<string, boolean>>({})
  const clipboard = ref<ImageAdjustments | null>(null)
  const saveTimer = ref<ReturnType<typeof setTimeout> | null>(null)

  let pendingSaveIds = new Set<string>()

  function getFor(mediaId: string | null): ImageAdjustments | null {
    if (!mediaId) return null
    return adjustments.value[mediaId] ?? null
  }

  function getResolvedFor(mediaId: string | null): ImageAdjustments {
    return cloneAdjustments(getFor(mediaId) ?? DEFAULT_IMAGE_ADJUSTMENTS)
  }

  async function load(mediaId: string): Promise<void> {
    if (!mediaId || loaded.value[mediaId]) return

    try {
      const result = await window.api.getAdjustments(mediaId)
      adjustments.value[mediaId] = result ?? null
      loaded.value[mediaId] = true
    } catch {
      loaded.value[mediaId] = true
    }
  }

  async function persist(mediaId: string): Promise<void> {
    const persisted = toPersistedAdjustments(adjustments.value[mediaId])
    adjustments.value[mediaId] = persisted
    loaded.value[mediaId] = true

    try {
      await window.api.saveAdjustments(mediaId, persisted)
    } catch {
      // Keep optimistic local state; a later load will reconcile.
    }
  }

  function scheduleSave(mediaId: string): void {
    pendingSaveIds.add(mediaId)

    if (saveTimer.value) {
      clearTimeout(saveTimer.value)
    }

    saveTimer.value = setTimeout(() => {
      void flush()
    }, 300)
  }

  function setField(mediaId: string, key: keyof ImageAdjustments, value: number): void {
    const next = getResolvedFor(mediaId)
    next[key] = value

    adjustments.value[mediaId] = toPersistedAdjustments(next)
    loaded.value[mediaId] = true
    scheduleSave(mediaId)
  }

  async function reset(mediaId: string): Promise<void> {
    adjustments.value[mediaId] = null
    loaded.value[mediaId] = true
    pendingSaveIds.delete(mediaId)
    await persist(mediaId)
  }

  function copy(mediaId: string): void {
    clipboard.value = getResolvedFor(mediaId)
  }

  async function paste(mediaId: string): Promise<void> {
    if (!clipboard.value) return

    adjustments.value[mediaId] = toPersistedAdjustments(clipboard.value)
    loaded.value[mediaId] = true
    pendingSaveIds.delete(mediaId)
    await persist(mediaId)
  }

  async function flush(): Promise<void> {
    if (saveTimer.value) {
      clearTimeout(saveTimer.value)
      saveTimer.value = null
    }

    const ids = [...pendingSaveIds]
    pendingSaveIds = new Set<string>()

    await Promise.all(ids.map((mediaId) => persist(mediaId)))
  }

  return {
    adjustments,
    loaded,
    clipboard,
    saveTimer,
    getFor,
    getResolvedFor,
    load,
    setField,
    reset,
    copy,
    paste,
    flush
  }
})