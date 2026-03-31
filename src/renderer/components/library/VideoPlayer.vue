<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import Slider from 'primevue/slider'

import { formatDuration } from '@/lib/media'
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

function clampPan(pan: Pan, overflowX: number, overflowY: number): Pan {
  const clampedX = overflowX > 0 ? Math.max(-overflowX / 2, Math.min(overflowX / 2, pan.x)) : 0
  const clampedY = overflowY > 0 ? Math.max(-overflowY / 2, Math.min(overflowY / 2, pan.y)) : 0
  return { x: clampedX, y: clampedY }
}

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

const controlsPinned = ref(false)
const controlsVisible = ref(true)
let hideTimer: number | null = null

const sourceUrl = computed(() => props.media?.working_file_path ?? props.media?.file_path ?? null)
const zoom = computed(() => props.zoom ?? 'fit')

// ---------------------------------------------------------------------------
// Resize observer
// ---------------------------------------------------------------------------

let resizeObserver: ResizeObserver | null = null

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

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  clearHideTimer()
})

// ---------------------------------------------------------------------------
// Reset state on source/zoom change
// ---------------------------------------------------------------------------

watch([zoom, sourceUrl], () => {
  pan.value = { x: 0, y: 0 }
})

watch(
  () => props.media?.id,
  () => {
    currentTime.value = 0
    duration.value = props.media?.duration ?? 0
    nativeSize.value = { width: 0, height: 0 }
    isPlaying.value = false
  }
)

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Controls visibility
// ---------------------------------------------------------------------------

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

watch(controlsPinned, (pinned) => {
  if (pinned) {
    clearHideTimer()
    controlsVisible.value = true
  } else {
    scheduleControlsHide()
  }
})

// ---------------------------------------------------------------------------
// Video events
// ---------------------------------------------------------------------------

function onLoadedMetadata(): void {
  const video = videoRef.value
  if (!video) return
  nativeSize.value = { width: video.videoWidth || 0, height: video.videoHeight || 0 }
  duration.value = Number.isFinite(video.duration) ? video.duration : (props.media?.duration ?? 0)
}

function onTimeUpdate(): void {
  const video = videoRef.value
  if (video) currentTime.value = video.currentTime
}

function onPlay(): void {
  isPlaying.value = true
}
function onPause(): void {
  isPlaying.value = false
}

function onVolumeChange(): void {
  const video = videoRef.value
  if (!video) return
  volume.value = video.volume
  isMuted.value = video.muted || video.volume <= 0
}

// ---------------------------------------------------------------------------
// Playback controls
// ---------------------------------------------------------------------------

async function togglePlayback(): Promise<void> {
  const video = videoRef.value
  if (!video) return
  if (video.paused) {
    try {
      await video.play()
    } catch {
      // Ignore play interruption
    }
    return
  }
  video.pause()
}

function handleSeek(value: number | number[]): void {
  const v = Array.isArray(value) ? value[0] : value
  if (v === undefined) return
  currentTime.value = v
  const video = videoRef.value
  if (video) video.currentTime = v
}

function handleVolumeSlider(value: number | number[]): void {
  const v = Array.isArray(value) ? value[0] ?? 0 : value
  const video = videoRef.value
  if (!video) return
  const nextVolume = Math.max(0, Math.min(1, v / 100))
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
  const video = videoRef.value
  if (!video) return
  video.loop = !video.loop
  isLooping.value = video.loop
}

// ---------------------------------------------------------------------------
// Pan / drag
// ---------------------------------------------------------------------------

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

const cursor = computed(() =>
  geometry.value.isPannable ? (isDragging.value ? 'grabbing' : 'grab') : 'default'
)

const volumeDisplay = computed(() => Math.round((isMuted.value ? 0 : volume.value) * 100))
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
    ref="containerRef"
    class="relative h-full w-full overflow-hidden rounded-md bg-black"
    @mousemove="revealControls"
    @mouseenter="revealControls"
    @mouseleave="
      () => {
        endDrag()
        if (!controlsPinned) controlsVisible = false
      }
    "
  >
    <!-- Video area (pannable) -->
    <div
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
        class="absolute"
        preload="metadata"
        @loadedmetadata="onLoadedMetadata"
        @durationchange="onLoadedMetadata"
        @timeupdate="onTimeUpdate"
        @play="onPlay"
        @pause="onPause"
        @volumechange="onVolumeChange"
        :style="{
          left: `${geometry.left}px`,
          top: `${geometry.top}px`,
          width: `${geometry.displayWidth}px`,
          height: `${geometry.displayHeight}px`
        }"
      />
    </div>

    <!-- Controls overlay -->
    <div
      class="absolute bottom-0 left-0 right-0 z-20 bg-black/58 px-3 py-2.5 backdrop-blur-sm transition-opacity duration-200"
      :class="controlsVisible ? 'opacity-100' : 'pointer-events-none opacity-0'"
    >
      <div class="flex items-center gap-2.5">
        <!-- Play/Pause -->
        <button
          type="button"
          class="rounded-sm p-1 text-white/90 transition hover:bg-white/15"
          :aria-label="isPlaying ? 'Pause' : 'Play'"
          @click="togglePlayback()"
        >
          <Icon :icon="isPlaying ? 'lucide:pause' : 'lucide:play'" class="size-4" />
        </button>

        <!-- Time display -->
        <div class="min-w-24 text-xs tabular-nums text-white/85">
          {{ formatDuration(currentTime) }} / {{ formatDuration(duration) }}
        </div>

        <!-- Seek slider -->
        <Slider
          :model-value="Math.min(currentTime, duration || 0)"
          :max="Math.max(duration, 0.001)"
          :step="0.01"
          class="mx-1 flex-1"
          aria-label="Seek"
          @update:model-value="handleSeek"
        />

        <!-- Mute -->
        <button
          type="button"
          class="rounded-sm p-1 text-white/90 transition hover:bg-white/15"
          :aria-label="isMuted ? 'Unmute' : 'Mute'"
          @click="toggleMute"
        >
          <Icon :icon="isMuted ? 'lucide:volume-x' : 'lucide:volume-2'" class="size-4" />
        </button>

        <!-- Volume slider -->
        <Slider
          :model-value="volumeDisplay"
          :max="100"
          :step="1"
          class="w-20"
          aria-label="Volume"
          @update:model-value="handleVolumeSlider"
        />

        <!-- Loop -->
        <button
          type="button"
          class="rounded-sm p-1 text-white/90 transition hover:bg-white/15"
          :class="isLooping && 'bg-white/18'"
          aria-label="Loop"
          @click="toggleLoop"
        >
          <Icon icon="lucide:repeat" class="size-4" />
        </button>

        <!-- Pin controls -->
        <button
          type="button"
          class="rounded-sm p-1 text-white/90 transition hover:bg-white/15"
          :class="controlsPinned && 'bg-white/18'"
          :aria-label="controlsPinned ? 'Unpin controls' : 'Pin controls'"
          @click="controlsPinned = !controlsPinned"
        >
          <Icon icon="lucide:pin" class="size-4" />
        </button>
      </div>
    </div>
  </div>
</template>
