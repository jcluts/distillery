import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { hasVideoEdits, snapToFrame } from '@/lib/media'
import { useLibraryStore } from '@/stores/library'
import type { VideoEdits, VideoMetadata } from '@/types'

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function normalizeEdits(edits: VideoEdits | null | undefined): VideoEdits | null {
  if (!edits || edits.version !== 1) {
    return null
  }

  const trim = edits.trim
  if (
    !trim ||
    !Number.isFinite(trim.startTime) ||
    !Number.isFinite(trim.endTime) ||
    trim.endTime <= trim.startTime
  ) {
    return null
  }

  return {
    version: 1,
    trim: {
      startTime: trim.startTime,
      endTime: trim.endTime
    },
    timestamp: edits.timestamp
  }
}

export const useVideoEditStore = defineStore('video-edits', () => {
  const editsCache = ref<Record<string, VideoEdits | null>>({})
  const loaded = ref<Record<string, boolean>>({})

  const activeMediaId = ref<string | null>(null)
  const trimMode = ref(false)
  const trimStart = ref<number | null>(null)
  const trimEnd = ref<number | null>(null)

  const metadata = ref<VideoMetadata | null>(null)
  const currentTime = ref(0)
  const isPlaying = ref(false)

  const libraryStore = useLibraryStore()

  function getEditsFor(mediaId: string | null): VideoEdits | null {
    if (!mediaId) return null
    return editsCache.value[mediaId] ?? null
  }

  function syncTrimState(mediaId: string | null): void {
    if (!mediaId) {
      trimStart.value = null
      trimEnd.value = null
      return
    }

    const trim = editsCache.value[mediaId]?.trim
    trimStart.value = trim?.startTime ?? null
    trimEnd.value = trim?.endTime ?? null
  }

  function getSourceDuration(mediaId: string | null): number | null {
    if (!mediaId) return null

    if (activeMediaId.value === mediaId && metadata.value?.duration) {
      return metadata.value.duration
    }

    const media = libraryStore.items.find((item) => item.id === mediaId) ?? null
    if (media?.duration && Number.isFinite(media.duration)) {
      return media.duration
    }

    const cachedTrim = editsCache.value[mediaId]?.trim
    if (cachedTrim?.endTime && Number.isFinite(cachedTrim.endTime)) {
      return cachedTrim.endTime
    }

    return null
  }

  function setActiveMedia(mediaId: string | null): void {
    activeMediaId.value = mediaId
    metadata.value = null
    currentTime.value = 0
    isPlaying.value = false
    syncTrimState(mediaId)
  }

  function clearSession(): void {
    trimMode.value = false
    activeMediaId.value = null
    trimStart.value = null
    trimEnd.value = null
    metadata.value = null
    currentTime.value = 0
    isPlaying.value = false
  }

  async function loadEdits(mediaId: string): Promise<VideoEdits | null> {
    if (!mediaId) return null

    activeMediaId.value = mediaId

    if (!loaded.value[mediaId]) {
      try {
        const result = normalizeEdits(await window.api.videoEdits.get(mediaId))
        editsCache.value = { ...editsCache.value, [mediaId]: result }
      } catch {
        editsCache.value = { ...editsCache.value, [mediaId]: null }
      }

      loaded.value = { ...loaded.value, [mediaId]: true }
    }

    syncTrimState(mediaId)
    return editsCache.value[mediaId] ?? null
  }

  async function saveEdits(mediaId = activeMediaId.value): Promise<void> {
    if (!mediaId) return

    const duration = getSourceDuration(mediaId)
    const safeFrameRate = frameRate.value
    const start = trimStart.value ?? 0
    const end = trimEnd.value ?? duration

    let next: VideoEdits | null = null

    if (end !== null) {
      const snappedStart = clamp(snapToFrame(start, safeFrameRate), 0, end)
      const maxEnd = duration ?? end
      const snappedEnd = clamp(snapToFrame(end, safeFrameRate), snappedStart, maxEnd)
      const tolerance = 0.5 / safeFrameRate

      if (!(duration !== null && snappedStart <= tolerance && Math.abs(snappedEnd - duration) <= tolerance)) {
        next = {
          version: 1,
          trim: {
            startTime: snappedStart,
            endTime: snappedEnd
          },
          timestamp: new Date().toISOString()
        }
      }
    }

    editsCache.value = { ...editsCache.value, [mediaId]: next }
    loaded.value = { ...loaded.value, [mediaId]: true }
    syncTrimState(mediaId)

    try {
      await window.api.videoEdits.save(mediaId, next)
    } catch {
      // Keep optimistic local state; a later load will reconcile.
    }
  }

  async function enterTrimMode(mediaId: string): Promise<void> {
    await loadEdits(mediaId)
    trimMode.value = true
  }

  function exitTrimMode(): void {
    trimMode.value = false
  }

  async function setTrimStart(
    time: number,
    options: { persist?: boolean } = {}
  ): Promise<void> {
    const mediaId = activeMediaId.value
    if (!mediaId) return

    const safeFrameRate = frameRate.value
    const duration = getSourceDuration(mediaId) ?? trimEnd.value ?? Math.max(time, 0)
    const minSpan = 3 / safeFrameRate
    const maxStart = Math.max(0, (trimEnd.value ?? duration) - minSpan)

    trimStart.value = clamp(snapToFrame(time, safeFrameRate), 0, maxStart)

    if (options.persist !== false) {
      await saveEdits(mediaId)
    }
  }

  async function setTrimEnd(
    time: number,
    options: { persist?: boolean } = {}
  ): Promise<void> {
    const mediaId = activeMediaId.value
    if (!mediaId) return

    const safeFrameRate = frameRate.value
    const duration = getSourceDuration(mediaId) ?? Math.max(trimStart.value ?? 0, time)
    const minSpan = 3 / safeFrameRate
    const minEnd = Math.min(duration, (trimStart.value ?? 0) + minSpan)

    trimEnd.value = clamp(snapToFrame(time, safeFrameRate), minEnd, duration)

    if (options.persist !== false) {
      await saveEdits(mediaId)
    }
  }

  async function clearTrim(
    mediaId = activeMediaId.value,
    options: { persist?: boolean } = {}
  ): Promise<void> {
    if (!mediaId) return

    trimStart.value = null
    trimEnd.value = null

    if (options.persist !== false) {
      await saveEdits(mediaId)
      return
    }

    editsCache.value = { ...editsCache.value, [mediaId]: null }
    loaded.value = { ...loaded.value, [mediaId]: true }
  }

  function setMetadata(value: VideoMetadata | null): void {
    metadata.value = value
  }

  function setCurrentTime(time: number): void {
    currentTime.value = Number.isFinite(time) ? time : 0
  }

  function setIsPlaying(playing: boolean): void {
    isPlaying.value = playing
  }

  const currentEdits = computed(() => getEditsFor(activeMediaId.value))

  const hasTrim = computed(
    () => trimStart.value !== null || trimEnd.value !== null || hasVideoEdits(currentEdits.value)
  )

  const frameRate = computed(() => {
    const nextFrameRate = metadata.value?.frameRate
    return Number.isFinite(nextFrameRate) && nextFrameRate && nextFrameRate > 0 ? nextFrameRate : 30
  })

  const trimmedDuration = computed(() => {
    const duration = getSourceDuration(activeMediaId.value)
    const start = trimStart.value ?? 0
    const end = trimEnd.value ?? duration ?? 0
    return Math.max(0, end - start)
  })

  return {
    editsCache,
    loaded,
    activeMediaId,
    trimMode,
    trimStart,
    trimEnd,
    metadata,
    currentTime,
    isPlaying,
    currentEdits,
    hasTrim,
    trimmedDuration,
    frameRate,
    getEditsFor,
    getSourceDuration,
    setActiveMedia,
    clearSession,
    loadEdits,
    saveEdits,
    enterTrimMode,
    exitTrimMode,
    setTrimStart,
    setTrimEnd,
    clearTrim,
    setMetadata,
    setCurrentTime,
    setIsPlaying
  }
})