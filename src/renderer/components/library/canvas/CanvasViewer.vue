<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue'

import { draw } from '@/lib/canvas-draw'
import { hasAdjustments } from '@/lib/adjustment-constants'
import { useAdjustmentStore } from '@/stores/adjustment'
import type { ZoomLevel } from '@/stores/ui'
import { useRemovalStore } from '@/stores/removal'
import { useTransformStore } from '@/stores/transform'
import type { MediaRecord } from '@/types'
import { WebGLProcessor } from '@/webgl'

const props = withDefaults(
  defineProps<{
    media: MediaRecord | null
    zoom?: ZoomLevel
  }>(),
  {
    zoom: 'fit'
  }
)

const removalStore = useRemovalStore()
const transformStore = useTransformStore()
const adjustmentStore = useAdjustmentStore()

const containerRef = ref<HTMLDivElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const imageRef = ref<HTMLImageElement | null>(null)
const adjustedSourceRef = ref<HTMLCanvasElement | null>(null)
const isPannable = ref(false)
const dragging = ref(false)

const panOffset = { x: 0, y: 0 }
const dragStart = { x: 0, y: 0 }
const dragStartOffset = { x: 0, y: 0 }
let isDragging = false
let resizeObserver: ResizeObserver | null = null
let transformCanvas: HTMLCanvasElement | null = null
let webglProcessor: WebGLProcessor | null = null
let loadedWebglImage: HTMLImageElement | null = null
let adjustedRenderToken = 0

const imageUrl = computed(() => props.media?.working_file_path ?? props.media?.file_path ?? null)

const transforms = computed(() =>
  props.media ? transformStore.getTransformsFor(props.media.id) : null
)

const adjustments = computed(() =>
  props.media ? adjustmentStore.getFor(props.media.id) : null
)

const isCropTarget = computed(
  () => transformStore.cropMode && transformStore.cropMediaId === props.media?.id
)

const isPaintTarget = computed(
  () => removalStore.paintMode && removalStore.paintMediaId === props.media?.id
)

const cursor = computed(() => {
  if (isCropTarget.value) return 'crosshair'
  if (isPaintTarget.value) return 'default'
  if (!isPannable.value) return 'default'
  return dragging.value ? 'grabbing' : 'grab'
})

// Load transforms when media changes
watch(
  () => props.media,
  (media) => {
    if (media?.id && media.media_type === 'image') {
      void transformStore.loadTransforms(media.id)
      void adjustmentStore.load(media.id)
    }
  },
  { immediate: true }
)

function getTransformCanvas(): HTMLCanvasElement {
  transformCanvas ??= document.createElement('canvas')
  return transformCanvas
}

function ensureWebGLProcessor(): WebGLProcessor {
  webglProcessor ??= new WebGLProcessor()
  webglProcessor.initialize()
  return webglProcessor
}

async function syncAdjustedSource(forceReload = false): Promise<void> {
  const media = props.media
  const image = imageRef.value
  const token = ++adjustedRenderToken

  if (!media || media.media_type !== 'image' || !image || !hasAdjustments(adjustments.value)) {
    adjustedSourceRef.value = null
    redraw()
    return
  }

  try {
    const processor = ensureWebGLProcessor()

    if (forceReload || loadedWebglImage !== image) {
      await processor.loadImage(image)
      if (token !== adjustedRenderToken) return
      loadedWebglImage = image
    }

    processor.render(adjustments.value)
    if (token !== adjustedRenderToken) return

    adjustedSourceRef.value = processor.getCanvas()
  } catch {
    if (token !== adjustedRenderToken) return
    adjustedSourceRef.value = null
  }

  redraw()
}

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
    adjustedSource: adjustedSourceRef.value,
    media: props.media,
    zoom: props.zoom,
    panOffset,
    transforms: transforms.value,
    suppressCrop: isCropTarget.value,
    transformCanvas: getTransformCanvas()
  })

  panOffset.x = result.clampedPanOffset.x
  panOffset.y = result.clampedPanOffset.y
  isPannable.value = !isCropTarget.value && !isPaintTarget.value && result.pannable

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

  // Report image rect to removal store for mask overlay positioning
  if (removalStore.paintMode && result.imageRect) {
    removalStore.setMaskOverlay({
      containerWidth: rect.width,
      containerHeight: rect.height,
      imageX: result.imageRect.x,
      imageY: result.imageRect.y,
      imageWidth: result.imageRect.w,
      imageHeight: result.imageRect.h
    })
  } else if (!removalStore.paintMode) {
    removalStore.setMaskOverlay(null)
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
  if (isCropTarget.value || isPaintTarget.value || !isPannable.value) return

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

// Reset pan when zoom, transforms, crop mode, paint mode, or image changes
watch(
  [() => props.zoom, imageUrl, transforms, isCropTarget, isPaintTarget],
  () => {
    resetPan()
    redraw()
  }
)

// Redraw when transforms change (rotation, flip, crop applied)
watch(transforms, () => {
  redraw()
})

watch(
  () => props.media?.id ?? null,
  () => {
    loadedWebglImage = null
    void syncAdjustedSource(true)
  }
)

watch(imageRef, () => {
  loadedWebglImage = null
  void syncAdjustedSource(true)
})

watch(adjustments, () => {
  void syncAdjustedSource(false)
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
  webglProcessor?.dispose()
  webglProcessor = null
  transformCanvas = null
  transformStore.setCropOverlay(null)
  removalStore.setMaskOverlay(null)
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