<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import Button from 'primevue/button'
import Slider from 'primevue/slider'

import TrimTimeline from '@/components/library/TrimTimeline.vue'
import { formatDuration, formatTimecode } from '@/lib/media'
import { useVideoEditStore } from '@/stores/video-edits'
import type { ZoomLevel } from '@/stores/ui'
import type { MediaRecord } from '@/types'

interface Pan {
  x: number
  y: number
}

const props = defineProps<{
  media: MediaRecord | null
  zoom?: ZoomLevel
}>()

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function clampPan(pan: Pan, overflowX: number, overflowY: number): Pan {
  const clampedX = overflowX > 0 ? Math.max(-overflowX / 2, Math.min(overflowX / 2, pan.x)) : 0
  const clampedY = overflowY > 0 ? Math.max(-overflowY / 2, Math.min(overflowY / 2, pan.y)) : 0
  return { x: clampedX, y: clampedY }
}

function isTextInputFocused(): boolean {
  const active = document.activeElement as HTMLElement | null
  if (!active) return false

  const tagName = active.tagName.toLowerCase()
  if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
    return true
  }

  return active.isContentEditable
}

const videoEditStore = useVideoEditStore()

const rootRef = ref<HTMLDivElement | null>(null)
const containerRef = ref<HTMLDivElement | null>(null)
const videoRef = ref<HTMLVideoElement | null>(null)

const containerSize = ref({ width: 0, height: 0 })
const nativeSize = ref({ width: 0, height: 0 })
const pan = ref<Pan>({ x: 0, y: 0 })
const isDragging = ref(false)
const dragStart = ref<{ mouseX: number; mouseY: number; pan: Pan } | null>(null)

const isPlaying = ref(false)
const currentTime = ref(0)
const duration = ref(props.media?.duration ?? 0)
const volume = ref(1)
const isMuted = ref(false)
const isLooping = ref(false)

const manualControlsPinned = ref(false)
const controlsVisible = ref(true)
let hideTimer: number | null = null
let resizeObserver: ResizeObserver | null = null

const sourceUrl = computed(() => props.media?.working_file_path ?? props.media?.file_path ?? null)
const zoom = computed(() => props.zoom ?? 'fit')
const trimModeActive = computed(
  () => videoEditStore.trimMode && videoEditStore.activeMediaId === props.media?.id
)
const persistedTrim = computed(() => {
  if (!props.media) return null
  return videoEditStore.getEditsFor(props.media.id)?.trim ?? null
})
const trimStart = computed(
  () => (trimModeActive.value ? videoEditStore.trimStart : persistedTrim.value?.startTime) ?? null
)
const trimEnd = computed(
  () => (trimModeActive.value ? videoEditStore.trimEnd : persistedTrim.value?.endTime) ?? null
)
const effectiveStart = computed(() =>
  trimModeActive.value ? 0 : (persistedTrim.value?.startTime ?? 0)
)
const effectiveEnd = computed(() => {
  if (trimModeActive.value) {
    return duration.value
  }

  const nextEnd = persistedTrim.value?.endTime ?? duration.value
  return clamp(nextEnd, 0, duration.value || nextEnd || 0)
})
const effectiveDuration = computed(() => Math.max(0, effectiveEnd.value - effectiveStart.value))
const playbackStart = computed(() =>
  trimModeActive.value ? (videoEditStore.trimStart ?? 0) : effectiveStart.value
)
const playbackEnd = computed(() => {
  if (!trimModeActive.value) {
    return effectiveEnd.value
  }

  const nextEnd = videoEditStore.trimEnd ?? duration.value
  const maxEnd = Math.max(duration.value, nextEnd, playbackStart.value)
  return clamp(nextEnd, playbackStart.value, maxEnd)
})
const controlsPinned = computed(() => manualControlsPinned.value || trimModeActive.value)
const displayCurrentTime = computed(() =>
  trimModeActive.value ? currentTime.value : Math.max(0, currentTime.value - effectiveStart.value)
)
const displayDuration = computed(() =>
  trimModeActive.value ? duration.value : effectiveDuration.value
)
const standardSeekValue = computed(() =>
  clamp(displayCurrentTime.value, 0, Math.max(displayDuration.value, 0))
)
const standardSeekMax = computed(() => Math.max(displayDuration.value, 0.001))
const cursor = computed(() =>
  geometry.value.isPannable ? (isDragging.value ? 'grabbing' : 'grab') : 'default'
)
const volumeDisplay = computed(() => Math.round((isMuted.value ? 0 : volume.value) * 100))
const frameStep = computed(() => 1 / videoEditStore.frameRate)

watch(
  containerRef,
  (el) => {
    resizeObserver?.disconnect()
    if (!el) return
    resizeObserver = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect()
      containerSize.value = { width: rect.width, height: rect.height }
    })
    resizeObserver.observe(el)
  },
  { immediate: true }
)

watch([zoom, sourceUrl], () => {
  pan.value = { x: 0, y: 0 }
})

watch(
  () => props.media?.id,
  async (mediaId) => {
    videoRef.value?.pause()
    currentTime.value = 0
    duration.value = props.media?.duration ?? 0
    nativeSize.value = { width: 0, height: 0 }
    isPlaying.value = false
    videoEditStore.setCurrentTime(0)
    videoEditStore.setIsPlaying(false)

    if (!mediaId) {
      return
    }

    videoEditStore.setActiveMedia(mediaId)
    await videoEditStore.loadEdits(mediaId)

    requestAnimationFrame(() => {
      rootRef.value?.focus()
    })
  },
  { immediate: true }
)

const geometry = computed(() => {
  const w = containerSize.value.width
  const h = containerSize.value.height
  const vw = nativeSize.value.width
  const vh = nativeSize.value.height

  if (w <= 0 || h <= 0 || vw <= 0 || vh <= 0) {
    return {
      displayWidth: 0,
      displayHeight: 0,
      overflowX: 0,
      overflowY: 0,
      left: 0,
      top: 0,
      isPannable: false,
      clampedPan: { x: 0, y: 0 }
    }
  }

  const scale = zoom.value === 'actual' ? 1 : Math.min(w / vw, h / vh)
  const displayWidth = vw * scale
  const displayHeight = vh * scale
  const overflowX = Math.max(0, displayWidth - w)
  const overflowY = Math.max(0, displayHeight - h)
  const clampedPan = clampPan(pan.value, overflowX, overflowY)

  return {
    displayWidth,
    displayHeight,
    overflowX,
    overflowY,
    left: (w - displayWidth) / 2 + clampedPan.x,
    top: (h - displayHeight) / 2 + clampedPan.y,
    isPannable: overflowX > 0 || overflowY > 0,
    clampedPan
  }
})

watch(
  () => geometry.value.clampedPan,
  (clamped) => {
    if (pan.value.x !== clamped.x || pan.value.y !== clamped.y) {
      pan.value = clamped
    }
  }
)

watch(
  [playbackStart, playbackEnd, trimModeActive, () => props.media?.id],
  () => {
    const video = videoRef.value
    if (!video || duration.value <= 0) return

    if (trimModeActive.value && video.paused) {
      return
    }

    if (video.currentTime < playbackStart.value) {
      setVideoTime(playbackStart.value)
      return
    }

    if (video.currentTime > playbackEnd.value) {
      if (isLooping.value) {
        setVideoTime(playbackStart.value)
        if (!video.paused) {
          void video.play().catch(() => {})
        }
        return
      }

      setVideoTime(playbackEnd.value)
      if (!video.paused) {
        video.pause()
      }
    }
  },
  { immediate: true }
)

function clearHideTimer(): void {
  if (hideTimer !== null) {
    window.clearTimeout(hideTimer)
    hideTimer = null
  }
}

function scheduleControlsHide(): void {
  clearHideTimer()
  if (controlsPinned.value) return

  hideTimer = window.setTimeout(() => {
    controlsVisible.value = false
  }, 2000)
}

function revealControls(): void {
  controlsVisible.value = true
  scheduleControlsHide()
}

function focusPlayer(): void {
  rootRef.value?.focus()
}

watch(
  controlsPinned,
  (pinned) => {
    if (pinned) {
      clearHideTimer()
      controlsVisible.value = true
      return
    }

    scheduleControlsHide()
  },
  { immediate: true }
)

function setVideoTime(time: number): void {
  const video = videoRef.value
  if (!video) return

  const boundedTime = clamp(time, 0, Math.max(duration.value, 0))
  video.currentTime = boundedTime
  currentTime.value = boundedTime
  videoEditStore.setCurrentTime(boundedTime)
}

function onLoadedMetadata(): void {
  const video = videoRef.value
  if (!video) return

  const nextDuration = Number.isFinite(video.duration)
    ? video.duration
    : (props.media?.duration ?? 0)
  nativeSize.value = { width: video.videoWidth || 0, height: video.videoHeight || 0 }
  duration.value = nextDuration
  volume.value = video.volume
  isMuted.value = video.muted || video.volume <= 0
  video.loop = false

  videoEditStore.setMetadata({
    duration: nextDuration,
    width: video.videoWidth || 0,
    height: video.videoHeight || 0,
    frameRate: 30
  })

  if (!trimModeActive.value && nextDuration > 0) {
    const start = effectiveStart.value
    const end = Math.min(effectiveEnd.value, nextDuration)

    if (video.currentTime < start || video.currentTime > end || video.currentTime === 0) {
      setVideoTime(start)
    }
  }
}

function onTimeUpdate(): void {
  const video = videoRef.value
  if (!video) return

  const nextTime = video.currentTime
  const shouldClampPlayback = !trimModeActive.value || !video.paused

  if (shouldClampPlayback && playbackEnd.value > playbackStart.value) {
    if (nextTime < playbackStart.value) {
      setVideoTime(playbackStart.value)
      return
    }

    if (nextTime >= playbackEnd.value) {
      if (isLooping.value) {
        setVideoTime(playbackStart.value)
        if (!video.paused) {
          void video.play().catch(() => {})
        }
      } else {
        setVideoTime(playbackEnd.value)
        video.pause()
      }
      return
    }
  }

  currentTime.value = nextTime
  videoEditStore.setCurrentTime(nextTime)
}

function onEnded(): void {
  const video = videoRef.value
  if (!video) return

  if (isLooping.value) {
    setVideoTime(playbackStart.value)
    void video.play().catch(() => {})
    return
  }

  setVideoTime(playbackEnd.value)
}

function onPlay(): void {
  isPlaying.value = true
  videoEditStore.setIsPlaying(true)
}

function onPause(): void {
  isPlaying.value = false
  videoEditStore.setIsPlaying(false)
}

function onVolumeChange(): void {
  const video = videoRef.value
  if (!video) return
  volume.value = video.volume
  isMuted.value = video.muted || video.volume <= 0
}

async function togglePlayback(): Promise<void> {
  const video = videoRef.value
  if (!video) return

  if (video.paused) {
    const restartTime = playbackStart.value
    const stopTime = playbackEnd.value

    if (video.currentTime < restartTime || video.currentTime >= Math.max(stopTime - 0.01, 0)) {
      setVideoTime(restartTime)
    }

    try {
      await video.play()
    } catch {
      // Ignore play interruption.
    }
    return
  }

  video.pause()
}

function handleSeek(value: number | number[]): void {
  const nextValue = Array.isArray(value) ? value[0] : value
  if (nextValue === undefined) return

  setVideoTime(effectiveStart.value + nextValue)
}

function handleTrimTimelineSeek(time: number): void {
  setVideoTime(time)
}

function handleTrimStartUpdate(time: number | null): void {
  if (time === null) {
    videoEditStore.trimStart = null
    return
  }

  void videoEditStore.setTrimStart(time, { persist: false })
}

function handleTrimEndUpdate(time: number | null): void {
  if (time === null) {
    videoEditStore.trimEnd = null
    return
  }

  void videoEditStore.setTrimEnd(time, { persist: false })
}

function handleTrimSave(): void {
  void videoEditStore.saveEdits()
}

function handleVolumeSlider(value: number | number[]): void {
  const nextValue = Array.isArray(value) ? (value[0] ?? 0) : value
  const video = videoRef.value
  if (!video) return

  const nextVolume = Math.max(0, Math.min(1, nextValue / 100))
  video.volume = nextVolume
  video.muted = nextVolume <= 0
  volume.value = nextVolume
  isMuted.value = video.muted
}

function toggleMute(): void {
  const video = videoRef.value
  if (!video) return
  video.muted = !video.muted
  isMuted.value = video.muted
}

function toggleLoop(): void {
  isLooping.value = !isLooping.value
}

function jumpToStart(): void {
  setVideoTime(playbackStart.value)
}

function jumpToEnd(): void {
  setVideoTime(playbackEnd.value)
}

function stepByFrames(direction: -1 | 1): void {
  setVideoTime(currentTime.value + direction * frameStep.value)
}

function setTrimInAtCurrentTime(): void {
  void videoEditStore.setTrimStart(currentTime.value)
}

function setTrimOutAtCurrentTime(): void {
  void videoEditStore.setTrimEnd(currentTime.value)
}

function clearTrim(): void {
  void videoEditStore.clearTrim(props.media?.id)
}

function onMouseDown(event: MouseEvent): void {
  if (!geometry.value.isPannable) return
  dragStart.value = { mouseX: event.clientX, mouseY: event.clientY, pan: { ...pan.value } }
  isDragging.value = true
}

function onMouseMove(event: MouseEvent): void {
  revealControls()
  if (!isDragging.value || !dragStart.value) return

  const dx = event.clientX - dragStart.value.mouseX
  const dy = event.clientY - dragStart.value.mouseY
  pan.value = clampPan(
    { x: dragStart.value.pan.x + dx, y: dragStart.value.pan.y + dy },
    geometry.value.overflowX,
    geometry.value.overflowY
  )
}

function endDrag(): void {
  dragStart.value = null
  isDragging.value = false
}

function shouldHandleKeyboard(): boolean {
  if (!props.media) return false
  if (trimModeActive.value) return true

  const root = rootRef.value
  const active = document.activeElement
  return !!root && !!active && root.contains(active)
}

function onDocumentKeyDown(event: KeyboardEvent): void {
  if (event.defaultPrevented || isTextInputFocused() || !shouldHandleKeyboard()) {
    return
  }

  const key = event.key.toLowerCase()

  if (event.key === ' ' || key === 'k') {
    event.preventDefault()
    void togglePlayback()
    return
  }

  if (key === 'j') {
    event.preventDefault()
    stepByFrames(-1)
    return
  }

  if (key === 'l') {
    event.preventDefault()
    stepByFrames(1)
    return
  }

  if (trimModeActive.value && key === 'i') {
    event.preventDefault()
    setTrimInAtCurrentTime()
    return
  }

  if (trimModeActive.value && key === 'o') {
    event.preventDefault()
    setTrimOutAtCurrentTime()
  }
}

onMounted(() => {
  document.addEventListener('keydown', onDocumentKeyDown)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onDocumentKeyDown)
  resizeObserver?.disconnect()
  clearHideTimer()
})
</script>

<template>
  <div
    v-if="!media || !sourceUrl"
    class="flex h-full w-full items-center justify-center rounded-md bg-black/70 text-sm text-muted"
  >
    No selection
  </div>

  <div
    v-else
    ref="rootRef"
    tabindex="0"
    class="relative h-full w-full overflow-hidden rounded-md bg-black outline-none"
    @mousedown.capture="focusPlayer"
    @mousemove="revealControls"
    @mouseenter="revealControls"
    @mouseleave="
      () => {
        endDrag()
        if (!controlsPinned) controlsVisible = false
      }
    "
  >
    <div
      ref="containerRef"
      class="absolute inset-0"
      :style="{ cursor }"
      @mousedown="onMouseDown"
      @mousemove="onMouseMove"
      @mouseup="endDrag"
      @mouseleave="endDrag"
    >
      <video
        ref="videoRef"
        :src="sourceUrl"
        :style="{
          left: `${geometry.left}px`,
          top: `${geometry.top}px`,
          width: `${geometry.displayWidth}px`,
          height: `${geometry.displayHeight}px`
        }"
        class="absolute"
        preload="metadata"
        @loadedmetadata="onLoadedMetadata"
        @durationchange="onLoadedMetadata"
        @timeupdate="onTimeUpdate"
        @ended="onEnded"
        @play="onPlay"
        @pause="onPause"
        @volumechange="onVolumeChange"
      />
    </div>

    <div
      class="absolute bottom-0 left-0 right-0 z-20 bg-black/58 px-3 py-2.5 backdrop-blur-sm transition-opacity duration-200"
      :class="controlsVisible ? 'opacity-100' : 'pointer-events-none opacity-0'"
    >
      <div v-if="trimModeActive" class="flex flex-col gap-2.5">
        <div class="flex flex-wrap items-center gap-2">
          <button
            type="button"
            class="rounded-sm p-1 text-white/90 transition hover:bg-white/15"
            aria-label="Jump to trim start"
            @click="jumpToStart"
          >
            <Icon icon="lucide:skip-back" class="size-4" />
          </button>

          <button
            type="button"
            class="rounded-sm p-1 text-white/90 transition hover:bg-white/15"
            aria-label="Step back one frame"
            @click="stepByFrames(-1)"
          >
            <Icon icon="lucide:rewind" class="size-4" />
          </button>

          <button
            type="button"
            class="rounded-sm p-1 text-white/90 transition hover:bg-white/15"
            :aria-label="isPlaying ? 'Pause' : 'Play'"
            @click="togglePlayback()"
          >
            <Icon :icon="isPlaying ? 'lucide:pause' : 'lucide:play'" class="size-4" />
          </button>

          <button
            type="button"
            class="rounded-sm p-1 text-white/90 transition hover:bg-white/15"
            aria-label="Step forward one frame"
            @click="stepByFrames(1)"
          >
            <Icon icon="lucide:fast-forward" class="size-4" />
          </button>

          <button
            type="button"
            class="rounded-sm p-1 text-white/90 transition hover:bg-white/15"
            aria-label="Jump to trim end"
            @click="jumpToEnd"
          >
            <Icon icon="lucide:skip-forward" class="size-4" />
          </button>

          <div class="min-w-28 text-xs tabular-nums text-white/85">
            {{ formatTimecode(currentTime) }}
          </div>

          <Button size="small" severity="secondary" @click="setTrimInAtCurrentTime">
            I Set In
          </Button>

          <Button size="small" severity="secondary" @click="setTrimOutAtCurrentTime">
            O Set Out
          </Button>

          <button
            v-if="videoEditStore.hasTrim"
            type="button"
            class="rounded-sm p-1 text-white/90 transition hover:bg-white/15"
            aria-label="Clear trim"
            @click="clearTrim"
          >
            <Icon icon="lucide:x" class="size-4" />
          </button>

          <button
            type="button"
            class="rounded-sm p-1 text-white/90 transition hover:bg-white/15"
            :aria-label="isMuted ? 'Unmute' : 'Mute'"
            @click="toggleMute"
          >
            <Icon :icon="isMuted ? 'lucide:volume-x' : 'lucide:volume-2'" class="size-4" />
          </button>

          <Slider
            :model-value="volumeDisplay"
            :max="100"
            :step="1"
            class="w-20"
            aria-label="Volume"
            @update:model-value="handleVolumeSlider"
          />

          <button
            type="button"
            class="rounded-sm p-1 text-white/90 transition hover:bg-white/15"
            :class="isLooping && 'bg-white/18'"
            aria-label="Loop"
            @click="toggleLoop"
          >
            <Icon icon="lucide:repeat" class="size-4" />
          </button>
        </div>

        <TrimTimeline
          :duration="duration"
          :current-time="currentTime"
          :trim-start="trimStart"
          :trim-end="trimEnd"
          :frame-rate="videoEditStore.frameRate"
          @seek="handleTrimTimelineSeek"
          @update:trim-start="handleTrimStartUpdate"
          @update:trim-end="handleTrimEndUpdate"
          @save="handleTrimSave"
        />
      </div>

      <div v-else class="flex items-center gap-2.5">
        <button
          type="button"
          class="rounded-sm p-1 text-white/90 transition hover:bg-white/15"
          :aria-label="isPlaying ? 'Pause' : 'Play'"
          @click="togglePlayback()"
        >
          <Icon :icon="isPlaying ? 'lucide:pause' : 'lucide:play'" class="size-4" />
        </button>

        <div class="min-w-24 text-xs tabular-nums text-white/85">
          {{ formatDuration(standardSeekValue) }} / {{ formatDuration(displayDuration) }}
        </div>

        <Slider
          :model-value="standardSeekValue"
          :max="standardSeekMax"
          :step="0.01"
          class="mx-1 flex-1"
          aria-label="Seek"
          @update:model-value="handleSeek"
        />

        <button
          type="button"
          class="rounded-sm p-1 text-white/90 transition hover:bg-white/15"
          :aria-label="isMuted ? 'Unmute' : 'Mute'"
          @click="toggleMute"
        >
          <Icon :icon="isMuted ? 'lucide:volume-x' : 'lucide:volume-2'" class="size-4" />
        </button>

        <Slider
          :model-value="volumeDisplay"
          :max="100"
          :step="1"
          class="w-20"
          aria-label="Volume"
          @update:model-value="handleVolumeSlider"
        />

        <button
          type="button"
          class="rounded-sm p-1 text-white/90 transition hover:bg-white/15"
          :class="isLooping && 'bg-white/18'"
          aria-label="Loop"
          @click="toggleLoop"
        >
          <Icon icon="lucide:repeat" class="size-4" />
        </button>

        <button
          type="button"
          class="rounded-sm p-1 text-white/90 transition hover:bg-white/15"
          :class="manualControlsPinned && 'bg-white/18'"
          :aria-label="manualControlsPinned ? 'Unpin controls' : 'Pin controls'"
          @click="manualControlsPinned = !manualControlsPinned"
        >
          <Icon icon="lucide:pin" class="size-4" />
        </button>
      </div>
    </div>
  </div>
</template>
