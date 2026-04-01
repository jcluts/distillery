<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'

import { formatTimecode, snapToFrame } from '@/lib/media'

type DragTarget = 'in' | 'out' | 'region' | 'playhead' | null

interface DragState {
  target: Exclude<DragTarget, null>
  pointerTime: number
  start: number
  end: number
  moved: boolean
}

const props = defineProps<{
  duration: number
  currentTime: number
  trimStart: number | null
  trimEnd: number | null
  frameRate: number
}>()

const emit = defineEmits<{
  seek: [time: number]
  'update:trimStart': [time: number | null]
  'update:trimEnd': [time: number | null]
  save: []
}>()

const trackRef = ref<HTMLDivElement | null>(null)
const dragState = ref<DragState | null>(null)
const suppressClick = ref(false)

let suppressClickTimer: number | null = null

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

const safeDuration = computed(() => Math.max(props.duration, 0))
const safeFrameRate = computed(() => (props.frameRate > 0 ? props.frameRate : 30))
const minSpan = computed(() => 3 / safeFrameRate.value)

const resolvedStart = computed(() => clamp(props.trimStart ?? 0, 0, safeDuration.value))
const resolvedEnd = computed(() => {
  const fallbackEnd = safeDuration.value
  return clamp(props.trimEnd ?? fallbackEnd, resolvedStart.value, fallbackEnd)
})

const trimmedDuration = computed(() => Math.max(0, resolvedEnd.value - resolvedStart.value))

function toPercent(time: number): number {
  if (safeDuration.value <= 0) return 0
  return (clamp(time, 0, safeDuration.value) / safeDuration.value) * 100
}

const startPercent = computed(() => toPercent(resolvedStart.value))
const endPercent = computed(() => toPercent(resolvedEnd.value))
const playheadPercent = computed(() => toPercent(props.currentTime))

function clearSuppressClickSoon(): void {
  if (suppressClickTimer !== null) {
    window.clearTimeout(suppressClickTimer)
  }

  suppressClickTimer = window.setTimeout(() => {
    suppressClick.value = false
    suppressClickTimer = null
  }, 0)
}

function getTimeFromClientX(clientX: number): number {
  const rect = trackRef.value?.getBoundingClientRect()
  if (!rect || rect.width <= 0) return 0

  const ratio = clamp((clientX - rect.left) / rect.width, 0, 1)
  return ratio * safeDuration.value
}

function onDocumentMouseMove(event: MouseEvent): void {
  const state = dragState.value
  if (!state || safeDuration.value <= 0) return

  state.moved = true

  const rawTime = getTimeFromClientX(event.clientX)
  const pointerTime = snapToFrame(rawTime, safeFrameRate.value)

  if (state.target === 'playhead') {
    emit('seek', clamp(pointerTime, 0, safeDuration.value))
    return
  }

  if (state.target === 'in') {
    emit(
      'update:trimStart',
      clamp(pointerTime, 0, Math.max(0, resolvedEnd.value - minSpan.value))
    )
    return
  }

  if (state.target === 'out') {
    emit(
      'update:trimEnd',
      clamp(pointerTime, Math.min(safeDuration.value, resolvedStart.value + minSpan.value), safeDuration.value)
    )
    return
  }

  const span = state.end - state.start
  const delta = pointerTime - state.pointerTime
  const boundedStart = clamp(state.start + delta, 0, Math.max(0, safeDuration.value - span))
  const nextStart = snapToFrame(boundedStart, safeFrameRate.value)
  const nextEnd = clamp(
    snapToFrame(nextStart + span, safeFrameRate.value),
    nextStart + minSpan.value,
    safeDuration.value
  )

  emit('update:trimStart', nextStart)
  emit('update:trimEnd', nextEnd)
}

function onDocumentMouseUp(): void {
  const state = dragState.value
  if (!state) return

  document.removeEventListener('mousemove', onDocumentMouseMove)
  document.removeEventListener('mouseup', onDocumentMouseUp)

  dragState.value = null

  if (state.moved) {
    suppressClick.value = true
    clearSuppressClickSoon()

    if (state.target !== 'playhead') {
      emit('save')
    }
  }
}

function beginDrag(target: Exclude<DragTarget, null>, event: MouseEvent): void {
  if (safeDuration.value <= 0) return

  const pointerTime = snapToFrame(getTimeFromClientX(event.clientX), safeFrameRate.value)

  dragState.value = {
    target,
    pointerTime,
    start: resolvedStart.value,
    end: resolvedEnd.value,
    moved: false
  }

  document.addEventListener('mousemove', onDocumentMouseMove)
  document.addEventListener('mouseup', onDocumentMouseUp)

  event.preventDefault()
}

function handleTrackClick(event: MouseEvent): void {
  if (dragState.value || suppressClick.value || safeDuration.value <= 0) return
  emit('seek', getTimeFromClientX(event.clientX))
}

function clearHandle(target: 'in' | 'out'): void {
  if (target === 'in') {
    emit('update:trimStart', null)
  } else {
    emit('update:trimEnd', null)
  }

  emit('save')
}

onBeforeUnmount(() => {
  document.removeEventListener('mousemove', onDocumentMouseMove)
  document.removeEventListener('mouseup', onDocumentMouseUp)

  if (suppressClickTimer !== null) {
    window.clearTimeout(suppressClickTimer)
  }
})
</script>

<template>
  <div class="trim-timeline">
    <div ref="trackRef" class="trim-track" @click="handleTrackClick">
      <div class="trim-dim" :style="{ left: '0%', width: `${startPercent}%` }" />
      <div class="trim-region" :style="{ left: `${startPercent}%`, width: `${Math.max(0, endPercent - startPercent)}%` }" @mousedown.stop="beginDrag('region', $event)" />
      <div class="trim-dim" :style="{ left: `${endPercent}%`, width: `${Math.max(0, 100 - endPercent)}%` }" />

      <button
        type="button"
        class="trim-handle"
        :style="{ left: `${startPercent}%` }"
        aria-label="Trim in point"
        @mousedown.stop="beginDrag('in', $event)"
        @dblclick.stop="clearHandle('in')"
      >
        [
      </button>

      <button
        type="button"
        class="trim-handle"
        :style="{ left: `${endPercent}%` }"
        aria-label="Trim out point"
        @mousedown.stop="beginDrag('out', $event)"
        @dblclick.stop="clearHandle('out')"
      >
        ]
      </button>

      <button
        type="button"
        class="trim-playhead"
        :style="{ left: `${playheadPercent}%` }"
        aria-label="Current playhead"
        @mousedown.stop="beginDrag('playhead', $event)"
      >
        <span class="trim-playhead-head" />
        <span class="trim-playhead-line" />
      </button>
    </div>

    <div class="grid grid-cols-3 items-center gap-2 text-xs tabular-nums text-white/75">
      <span>{{ formatTimecode(currentTime) }}</span>
      <span class="text-center font-medium text-primary">{{ formatTimecode(trimmedDuration) }}</span>
      <span class="text-right">{{ formatTimecode(duration) }}</span>
    </div>
  </div>
</template>

<style scoped>
.trim-timeline {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  user-select: none;
}

.trim-track {
  position: relative;
  height: 2rem;
  overflow: hidden;
  border-radius: 0.5rem;
  background: rgba(255, 255, 255, 0.08);
  cursor: pointer;
}

.trim-dim,
.trim-region {
  position: absolute;
  top: 0;
  bottom: 0;
}

.trim-dim {
  background: rgba(0, 0, 0, 0.42);
}

.trim-region {
  background: rgba(255, 255, 255, 0.12);
  border-left: 1px solid var(--p-primary-color);
  border-right: 1px solid var(--p-primary-color);
  cursor: grab;
}

.trim-region:active {
  cursor: grabbing;
}

.trim-handle,
.trim-playhead {
  position: absolute;
  top: 0;
  bottom: 0;
  transform: translateX(-50%);
  border: 0;
  background: transparent;
  padding: 0;
}

.trim-handle {
  z-index: 2;
  width: 1rem;
  color: var(--p-primary-color);
  font-size: 1.125rem;
  font-weight: 700;
  cursor: ew-resize;
}

.trim-playhead {
  z-index: 3;
  width: 0.875rem;
  cursor: ew-resize;
}

.trim-playhead-head {
  position: absolute;
  top: 0.25rem;
  left: 50%;
  width: 0.625rem;
  height: 0.625rem;
  transform: translateX(-50%);
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.96);
}

.trim-playhead-line {
  position: absolute;
  top: 0.875rem;
  bottom: 0;
  left: 50%;
  width: 2px;
  transform: translateX(-50%);
  background: rgba(255, 255, 255, 0.96);
}
</style>