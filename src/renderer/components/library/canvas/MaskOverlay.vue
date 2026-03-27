<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import { useLibraryStore } from '@/stores/library'
import { useRemovalStore } from '@/stores/removal'
import type { RemovalStroke } from '@/types'

// -----------------------------------------------------------------------
// Stroke drawing
// -----------------------------------------------------------------------

interface DraftStroke {
  points: Array<{ x: number; y: number }>
  erasing: boolean
  brushSizeNormalized: number
}

function clamp01(value: number): number {
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

function drawStroke(
  ctx: CanvasRenderingContext2D,
  stroke: RemovalStroke | DraftStroke,
  imageX: number,
  imageY: number,
  imageWidth: number,
  imageHeight: number
): void {
  if (stroke.points.length === 0) return

  const brushSizePx = Math.max(1, stroke.brushSizeNormalized * imageWidth)
  const first = stroke.points[0]
  const firstX = imageX + first.x * imageWidth
  const firstY = imageY + first.y * imageHeight

  ctx.lineWidth = brushSizePx
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  if (stroke.erasing) {
    ctx.globalCompositeOperation = 'destination-out'
    ctx.strokeStyle = 'rgba(0,0,0,1)'
    ctx.fillStyle = 'rgba(0,0,0,1)'
  } else {
    ctx.globalCompositeOperation = 'source-over'
    ctx.strokeStyle = 'rgba(255, 88, 88, 0.82)'
    ctx.fillStyle = 'rgba(255, 88, 88, 0.4)'
  }

  if (stroke.points.length === 1) {
    ctx.beginPath()
    ctx.arc(firstX, firstY, brushSizePx / 2, 0, Math.PI * 2)
    ctx.fill()
    return
  }

  ctx.beginPath()
  ctx.moveTo(firstX, firstY)

  for (let i = 1; i < stroke.points.length; i += 1) {
    const point = stroke.points[i]
    ctx.lineTo(imageX + point.x * imageWidth, imageY + point.y * imageHeight)
  }

  ctx.stroke()
}

// -----------------------------------------------------------------------
// Store references
// -----------------------------------------------------------------------

const libraryStore = useLibraryStore()
const removalStore = useRemovalStore()

const wrapperRef = ref<HTMLDivElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)

const cursor = ref<{ x: number; y: number } | null>(null)
const cursorInImage = ref(false)
const liveStroke = ref<DraftStroke | null>(null)

// Non-reactive drawing state
let drawing = false
let draftPoints: Array<{ x: number; y: number }> = []
let rafId = 0

// -----------------------------------------------------------------------
// Computed
// -----------------------------------------------------------------------

const isPaintTarget = computed(
  () =>
    removalStore.paintMode &&
    !!removalStore.paintMediaId &&
    !!libraryStore.focusedId &&
    removalStore.paintMediaId === libraryStore.focusedId &&
    !!removalStore.maskOverlay
)

const imageX = computed(() => removalStore.maskOverlay?.imageX ?? 0)
const imageY = computed(() => removalStore.maskOverlay?.imageY ?? 0)
const imageWidth = computed(() => removalStore.maskOverlay?.imageWidth ?? 1)
const imageHeight = computed(() => removalStore.maskOverlay?.imageHeight ?? 1)

const brushCursorSize = computed(() => removalStore.brushSizeNormalized * imageWidth.value)

// -----------------------------------------------------------------------
// Canvas operations
// -----------------------------------------------------------------------

function resizeCanvas(): void {
  const canvas = canvasRef.value
  const overlay = removalStore.maskOverlay
  if (!canvas || !overlay) return

  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.max(1, Math.round(overlay.containerWidth * dpr))
  canvas.height = Math.max(1, Math.round(overlay.containerHeight * dpr))
  canvas.style.width = `${overlay.containerWidth}px`
  canvas.style.height = `${overlay.containerHeight}px`

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
}

function redraw(): void {
  const canvas = canvasRef.value
  const overlay = removalStore.maskOverlay
  if (!canvas || !overlay) return

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.clearRect(0, 0, overlay.containerWidth, overlay.containerHeight)

  for (const stroke of removalStore.draftStrokes) {
    drawStroke(ctx, stroke, imageX.value, imageY.value, imageWidth.value, imageHeight.value)
  }

  if (liveStroke.value) {
    drawStroke(
      ctx,
      liveStroke.value,
      imageX.value,
      imageY.value,
      imageWidth.value,
      imageHeight.value
    )
  }

  ctx.globalCompositeOperation = 'source-over'
}

function scheduleRedraw(): void {
  cancelAnimationFrame(rafId)
  rafId = requestAnimationFrame(redraw)
}

// -----------------------------------------------------------------------
// Coordinate mapping
// -----------------------------------------------------------------------

function toNormalizedPoint(event: PointerEvent): { x: number; y: number } | null {
  const overlay = removalStore.maskOverlay
  if (!overlay) return null

  const wrapper = wrapperRef.value
  if (!wrapper) return null

  const rect = wrapper.getBoundingClientRect()
  const localX = event.clientX - rect.left
  const localY = event.clientY - rect.top

  if (
    localX < imageX.value ||
    localY < imageY.value ||
    localX > imageX.value + imageWidth.value ||
    localY > imageY.value + imageHeight.value
  ) {
    return null
  }

  return {
    x: clamp01((localX - imageX.value) / imageWidth.value),
    y: clamp01((localY - imageY.value) / imageHeight.value)
  }
}

// -----------------------------------------------------------------------
// Pointer handlers
// -----------------------------------------------------------------------

function onPointerDown(event: PointerEvent): void {
  if (!isPaintTarget.value) return

  const point = toNormalizedPoint(event)
  if (!point) return

  event.preventDefault()

  drawing = true
  draftPoints = [point]
  liveStroke.value = {
    points: [...draftPoints],
    erasing: removalStore.tool === 'erase',
    brushSizeNormalized: removalStore.brushSizeNormalized
  }
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  scheduleRedraw()
}

function commitStroke(): void {
  if (!drawing) return

  drawing = false
  const points = draftPoints
  draftPoints = []
  liveStroke.value = null

  if (points.length > 0) {
    removalStore.addStroke(points)
  }

  redraw()
}

function onPointerMove(event: PointerEvent): void {
  if (!isPaintTarget.value) return
  if (!removalStore.maskOverlay) return

  const wrapper = wrapperRef.value
  if (!wrapper) return

  const rect = wrapper.getBoundingClientRect()
  const localX = event.clientX - rect.left
  const localY = event.clientY - rect.top

  const insideImage =
    localX >= imageX.value &&
    localY >= imageY.value &&
    localX <= imageX.value + imageWidth.value &&
    localY <= imageY.value + imageHeight.value

  cursor.value = { x: localX, y: localY }
  cursorInImage.value = insideImage

  if (!drawing) return

  const point = toNormalizedPoint(event)
  if (!point) return

  draftPoints.push(point)
  liveStroke.value = {
    points: [...draftPoints],
    erasing: removalStore.tool === 'erase',
    brushSizeNormalized: removalStore.brushSizeNormalized
  }
  scheduleRedraw()
}

function onPointerUp(): void {
  commitStroke()
}

function onPointerLeave(): void {
  cursor.value = null
  cursorInImage.value = false
  commitStroke()
}

// -----------------------------------------------------------------------
// Watchers
// -----------------------------------------------------------------------

// Redraw when overlay layout, draft strokes, or tool change
watch(
  [
    () => removalStore.maskOverlay,
    () => removalStore.draftStrokes,
    liveStroke,
    () => removalStore.tool,
    () => removalStore.brushSizeNormalized
  ],
  () => {
    resizeCanvas()
    redraw()
  }
)

// Reset drawing state when paint mode is exited
watch(isPaintTarget, (active) => {
  if (!active) {
    drawing = false
    draftPoints = []
    liveStroke.value = null
    cursor.value = null
    cursorInImage.value = false
    cancelAnimationFrame(rafId)
  }
})

onBeforeUnmount(() => {
  drawing = false
  draftPoints = []
  liveStroke.value = null
  cancelAnimationFrame(rafId)
})
</script>

<template>
  <div
    v-if="isPaintTarget && removalStore.maskOverlay"
    ref="wrapperRef"
    class="absolute inset-0 z-40"
    :style="{ cursor: cursor && !cursorInImage ? 'crosshair' : 'none' }"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointerleave="onPointerLeave"
  >
    <canvas ref="canvasRef" class="pointer-events-none absolute inset-0" />

    <!-- Brush cursor (only over image area) -->
    <div
      v-if="cursor && cursorInImage"
      class="pointer-events-none absolute rounded-full border border-white/80 bg-white/10"
      :style="{
        width: `${brushCursorSize}px`,
        height: `${brushCursorSize}px`,
        left: `${cursor.x - brushCursorSize / 2}px`,
        top: `${cursor.y - brushCursorSize / 2}px`
      }"
    />
  </div>
</template>
