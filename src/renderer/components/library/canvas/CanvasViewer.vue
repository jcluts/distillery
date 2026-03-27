<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue'

import { draw } from '@/lib/canvas-draw'
import type { ZoomLevel } from '@/stores/ui'
import { useTransformStore } from '@/stores/transform'
import type { MediaRecord } from '@/types'

const props = withDefaults(
  defineProps<{
    media: MediaRecord | null
    zoom?: ZoomLevel
  }>(),
  {
    zoom: 'fit'
  }
)

const transformStore = useTransformStore()

const containerRef = ref<HTMLDivElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const imageRef = ref<HTMLImageElement | null>(null)
const isPannable = ref(false)
const dragging = ref(false)

const panOffset = { x: 0, y: 0 }
const dragStart = { x: 0, y: 0 }
const dragStartOffset = { x: 0, y: 0 }
let isDragging = false
let resizeObserver: ResizeObserver | null = null

const imageUrl = computed(() => props.media?.working_file_path ?? props.media?.file_path ?? null)

const transforms = computed(() =>
  props.media ? transformStore.getTransformsFor(props.media.id) : null
)

const isCropTarget = computed(
  () => transformStore.cropMode && transformStore.cropMediaId === props.media?.id
)

const cursor = computed(() => {
  if (isCropTarget.value) return 'crosshair'
  if (!isPannable.value) return 'default'
  return dragging.value ? 'grabbing' : 'grab'
})

// Load transforms when media changes
watch(
  () => props.media,
  (media) => {
    if (media?.id && media.media_type === 'image') {
      void transformStore.loadTransforms(media.id)
    }
  },
  { immediate: true }
)

function resetPan(): void {
  panOffset.x = 0
  panOffset.y = 0
}

function redraw(): void {
  const container = containerRef.value
  const canvas = canvasRef.value
  if (!container || !canvas) return

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const rect = container.getBoundingClientRect()
  const result = draw({
    ctx,
    width: rect.width,
    height: rect.height,
    img: imageRef.value,
    media: props.media,
    zoom: props.zoom,
    panOffset,
    transforms: transforms.value,
    suppressCrop: isCropTarget.value
  })

  panOffset.x = result.clampedPanOffset.x
  panOffset.y = result.clampedPanOffset.y
  isPannable.value = !isCropTarget.value && result.pannable

  // Report image rect to transform store for crop overlay positioning
  if (isCropTarget.value && result.imageRect) {
    transformStore.setCropOverlay({
      containerWidth: rect.width,
      containerHeight: rect.height,
      imageX: result.imageRect.x,
      imageY: result.imageRect.y,
      imageWidth: result.imageRect.w,
      imageHeight: result.imageRect.h
    })
  } else {
    transformStore.setCropOverlay(null)
  }
}

function resizeCanvas(): void {
  const container = containerRef.value
  const canvas = canvasRef.value
  if (!container || !canvas) return

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const rect = container.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.max(1, Math.floor(rect.width * dpr))
  canvas.height = Math.max(1, Math.floor(rect.height * dpr))
  canvas.style.width = `${rect.width}px`
  canvas.style.height = `${rect.height}px`
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  redraw()
}

function onMouseDown(event: MouseEvent): void {
  if (isCropTarget.value || !isPannable.value) return

  isDragging = true
  dragging.value = true
  dragStart.x = event.clientX
  dragStart.y = event.clientY
  dragStartOffset.x = panOffset.x
  dragStartOffset.y = panOffset.y
}

function onMouseMove(event: MouseEvent): void {
  if (!isDragging || isCropTarget.value) return

  panOffset.x = dragStartOffset.x + (event.clientX - dragStart.x)
  panOffset.y = dragStartOffset.y + (event.clientY - dragStart.y)
  redraw()
}

function onMouseUp(): void {
  isDragging = false
  dragging.value = false
}

// Reset pan when zoom, transforms, crop mode, or image changes
watch(
  [() => props.zoom, imageUrl, transforms, isCropTarget],
  () => {
    resetPan()
    redraw()
  }
)

// Redraw when transforms change (rotation, flip, crop applied)
watch(transforms, () => {
  redraw()
})

watchEffect((onCleanup) => {
  const url = imageUrl.value
  let cancelled = false

  async function loadImage(): Promise<void> {
    if (!url) {
      imageRef.value = null
      redraw()
      return
    }

    try {
      const image = new Image()
      image.src = url
      await image.decode()

      if (cancelled) return

      imageRef.value = image
      redraw()
    } catch {
      if (cancelled) return

      imageRef.value = null
      redraw()
    }
  }

  void loadImage()

  onCleanup(() => {
    cancelled = true
  })
})

onMounted(() => {
  resizeCanvas()

  if (containerRef.value) {
    resizeObserver = new ResizeObserver(() => {
      resizeCanvas()
    })

    resizeObserver.observe(containerRef.value)
  }
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  transformStore.setCropOverlay(null)
})
</script>

<template>
  <div
    ref="containerRef"
    class="h-full w-full"
    :style="{ cursor }"
    @mousedown="onMouseDown"
    @mousemove="onMouseMove"
    @mouseup="onMouseUp"
    @mouseleave="onMouseUp"
  >
    <canvas ref="canvasRef" class="block h-full w-full" />
  </div>
</template>