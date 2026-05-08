<script setup lang="ts">
import { computed, ref } from 'vue'
import { Icon } from '@iconify/vue'
import Button from 'primevue/button'

import ImagePreviewModal from '@/components/modals/ImagePreviewModal.vue'
import { useGenerationStore, type RefImage } from '@/stores/generation'
import { useLibraryStore } from '@/stores/library'

// ---------------------------------------------------------------------------
// Store access
// ---------------------------------------------------------------------------

const generationStore = useGenerationStore()
const libraryStore = useLibraryStore()

// ---------------------------------------------------------------------------
// Local state
// ---------------------------------------------------------------------------

const isDragOver = ref(false)
const dragOverThumbIndex = ref<number | null>(null)
const draggingIndex = ref<number | null>(null)
const dragSourceIndex = ref<number | null>(null)

const previewOpen = ref(false)
const previewSrc = ref<string | null>(null)
const previewAlt = ref('Reference image')

function openPreview(src: string | null, alt: string): void {
  if (!src) return
  previewSrc.value = src
  previewAlt.value = alt
  previewOpen.value = true
}

// ---------------------------------------------------------------------------
// Image resolution
// ---------------------------------------------------------------------------

function resolveImage(img: RefImage): {
  thumbSrc: string | null
  fileSrc: string | null
  label: string
} {
  if (img.kind === 'id') {
    const media = libraryStore.items.find((m) => m.id === img.id) ?? null
    return {
      thumbSrc: media?.thumb_path ?? img.thumbSrc ?? null,
      fileSrc: media?.file_path ?? img.fileSrc ?? null,
      label: media?.file_name ?? img.label ?? 'Reference'
    }
  }
  const fileName = img.path.split(/[\\/]/).pop() ?? 'File'
  return {
    thumbSrc: img.thumbSrc ?? null,
    fileSrc: img.fileSrc ?? null,
    label: img.label ?? fileName
  }
}

// ---------------------------------------------------------------------------
// File picker
// ---------------------------------------------------------------------------

async function openFilePicker(): Promise<void> {
  const paths = await window.api.showOpenDialog({
    title: 'Choose reference images',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'tif', 'tiff'] }]
  })
  if (!paths || paths.length === 0) return
  const imported = await window.api.importMedia(paths)
  for (const m of imported) generationStore.addRefImage(generationStore.refImageFromMedia(m))
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractDroppedFilePaths(e: DragEvent): string[] {
  type ElectronFile = File & { path?: string }
  return Array.from(e.dataTransfer?.files ?? [])
    .map((f) => (f as ElectronFile).path)
    .filter((p): p is string => typeof p === 'string' && p.length > 0)
}

async function handleMediaDrop(e: DragEvent, replaceIndex?: number): Promise<void> {
  const toRefImage = (id: string): RefImage => {
    const media = libraryStore.items.find((m) => m.id === id)
    return media ? generationStore.refImageFromMedia(media) : { kind: 'id', id }
  }

  // Multi-media drop
  const multiIds = e.dataTransfer?.getData('application/x-distillery-media-ids')
  if (multiIds) {
    try {
      const ids = JSON.parse(multiIds) as string[]
      if (replaceIndex !== undefined && ids[0]) {
        generationStore.replaceRefImageAt(replaceIndex, toRefImage(ids[0]))
        for (let i = 1; i < ids.length; i++) generationStore.addRefImage(toRefImage(ids[i]))
      } else {
        for (const id of ids) generationStore.addRefImage(toRefImage(id))
      }
    } catch {
      /* ignore */
    }
    return
  }

  // Single-media drop
  const mediaId = e.dataTransfer?.getData('application/x-distillery-media-id')
  if (mediaId) {
    if (replaceIndex !== undefined) {
      generationStore.replaceRefImageAt(replaceIndex, toRefImage(mediaId))
    } else {
      generationStore.addRefImage(toRefImage(mediaId))
    }
    return
  }

  // File drop
  const filePaths = extractDroppedFilePaths(e)
  if (filePaths.length > 0) {
    const imported = await window.api.importMedia(filePaths)
    if (replaceIndex !== undefined && imported[0]) {
      generationStore.replaceRefImageAt(
        replaceIndex,
        generationStore.refImageFromMedia(imported[0])
      )
      for (let i = 1; i < imported.length; i++) {
        generationStore.addRefImage(generationStore.refImageFromMedia(imported[i]))
      }
    } else {
      for (const m of imported) generationStore.addRefImage(generationStore.refImageFromMedia(m))
    }
  }
}

// ---------------------------------------------------------------------------
// Zone-level drag handlers
// ---------------------------------------------------------------------------

function onZoneDragOver(e: DragEvent): void {
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
  isDragOver.value = true
}

function onZoneDragLeave(e: DragEvent): void {
  if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
    isDragOver.value = false
  }
}

async function onZoneDrop(e: DragEvent): Promise<void> {
  e.preventDefault()
  isDragOver.value = false

  // Internal reorder → move to end
  const refIdxStr = e.dataTransfer?.getData('application/x-ref-image-index')
  if (refIdxStr) {
    const from = dragSourceIndex.value
    if (from !== null && from !== generationStore.refImages.length - 1) {
      generationStore.reorderRefImages(from, generationStore.refImages.length - 1)
    }
    dragSourceIndex.value = null
    draggingIndex.value = null
    return
  }

  await handleMediaDrop(e)
}

// ---------------------------------------------------------------------------
// Thumbnail drag handlers
// ---------------------------------------------------------------------------

function onThumbDragStart(index: number, e: DragEvent): void {
  dragSourceIndex.value = index
  draggingIndex.value = index
  e.dataTransfer?.setData('application/x-ref-image-index', String(index))
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}

function onThumbDragEnd(): void {
  dragSourceIndex.value = null
  draggingIndex.value = null
  dragOverThumbIndex.value = null
}

function onThumbDragOver(index: number, e: DragEvent): void {
  e.preventDefault()
  e.stopPropagation()
  dragOverThumbIndex.value = index
}

function onThumbDragLeave(index: number, e: DragEvent): void {
  e.stopPropagation()
  if (dragOverThumbIndex.value === index) dragOverThumbIndex.value = null
}

async function onThumbDrop(index: number, e: DragEvent): Promise<void> {
  e.preventDefault()
  e.stopPropagation()
  dragOverThumbIndex.value = null
  isDragOver.value = false

  // Internal reorder
  const refIdxStr = e.dataTransfer?.getData('application/x-ref-image-index')
  if (refIdxStr) {
    const from = parseInt(refIdxStr, 10)
    if (!Number.isNaN(from) && from !== index) {
      generationStore.reorderRefImages(from, index)
    }
    dragSourceIndex.value = null
    draggingIndex.value = null
    return
  }

  await handleMediaDrop(e, index)
}

// ---------------------------------------------------------------------------
// Computed
// ---------------------------------------------------------------------------

const isEmpty = computed(() => generationStore.refImages.length === 0)
const isExternalDrag = computed(() => draggingIndex.value === null)
</script>

<template>
  <div
    :class="[
      'relative rounded-lg border-2 border-dashed transition-all duration-150',
      isEmpty ? 'cursor-pointer' : '',
      isDragOver && isExternalDrag
        ? 'border-primary bg-primary/5'
        : 'border-default bg-surface-100/30 hover:border-surface-400'
    ]"
    @dragover="onZoneDragOver"
    @dragleave="onZoneDragLeave"
    @drop="onZoneDrop"
    @click="isEmpty ? openFilePicker() : undefined"
  >
    <!-- Empty state -->
    <div
      v-if="isEmpty"
      :class="[
        'flex items-center gap-2.5 px-4 py-4 transition-colors',
        isDragOver ? 'text-primary' : 'text-muted'
      ]"
    >
      <Icon icon="lucide:image" class="size-4 shrink-0" />
      <div>
        <p class="text-sm font-medium leading-none">
          {{ isDragOver ? 'Drop to add reference' : 'Add reference images' }}
        </p>
        <p class="mt-0.5 text-xs text-muted">Drag from library, or click to browse</p>
      </div>
    </div>

    <!-- Thumbnail grid -->
    <div v-else class="grid grid-cols-3 gap-2 p-3">
      <div
        v-for="(img, idx) in generationStore.refImages"
        :key="img.kind === 'id' ? img.id : img.path"
        draggable="true"
        :class="[
          'group relative aspect-square w-full cursor-pointer overflow-hidden rounded-md border border-default bg-elevated transition-all',
          dragOverThumbIndex === idx && 'ring-2 ring-primary ring-offset-1',
          draggingIndex === idx && 'opacity-40'
        ]"
        :title="resolveImage(img).label"
        @dragstart="onThumbDragStart(idx, $event)"
        @dragend="onThumbDragEnd"
        @dragover="onThumbDragOver(idx, $event)"
        @dragleave="onThumbDragLeave(idx, $event)"
        @drop="onThumbDrop(idx, $event)"
        @click.stop="
          openPreview(
            resolveImage(img).fileSrc ?? resolveImage(img).thumbSrc,
            resolveImage(img).label
          )
        "
      >
        <img
          v-if="resolveImage(img).thumbSrc"
          :src="resolveImage(img).thumbSrc!"
          :alt="resolveImage(img).label"
          draggable="false"
          class="absolute inset-0 h-full w-full object-cover"
        />
        <div v-else class="absolute inset-0 flex items-center justify-center">
          <Icon icon="lucide:image" class="size-5 text-muted opacity-50" />
        </div>

        <!-- Hover overlay -->
        <div
          class="pointer-events-none absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/20"
        />

        <!-- Remove button -->
        <Button
          type="button"
          text
          rounded
          severity="secondary"
          class="!absolute right-1 top-1 z-10 !h-6 !w-6 !bg-black/70 !p-0 !text-white opacity-0 shadow-sm transition-opacity hover:!bg-black/85 focus:opacity-100 group-hover:opacity-100"
          :aria-label="`Remove ${resolveImage(img).label}`"
          :title="`Remove ${resolveImage(img).label}`"
          @click.stop="generationStore.removeRefImageAt(idx)"
        >
          <Icon icon="lucide:x" class="size-3.5" />
        </Button>
      </div>

      <!-- Add more button -->
      <button
        type="button"
        class="flex aspect-square w-full items-center justify-center rounded-md border border-dashed border-default bg-transparent text-muted transition-colors hover:border-primary/50 hover:text-primary"
        aria-label="Add more reference images"
        title="Add more"
        @click.stop="openFilePicker"
      >
        <Icon icon="lucide:plus" class="size-4" />
      </button>
    </div>

    <!-- Drag-over overlay when images present -->
    <div
      v-if="!isEmpty && isDragOver && isExternalDrag"
      class="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-primary/10 ring-2 ring-inset ring-primary"
    >
      <span class="rounded-md bg-surface-900/90 px-2 py-1 text-xs font-medium text-primary shadow">
        Drop to add
      </span>
    </div>
  </div>

  <ImagePreviewModal v-model:open="previewOpen" :src="previewSrc" :alt="previewAlt" />
</template>
