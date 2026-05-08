<script setup lang="ts">
import { useVirtualizer } from '@tanstack/vue-virtual'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

import { GRID_BUFFER_ROWS } from '@/lib/constants'
import { useGridSelection } from '@/composables/useGridSelection'
import { useLibraryMediaDrag } from '@/composables/useLibraryMediaDrag'
import { useLibraryStore } from '@/stores/library'
import { useUIStore } from '@/stores/ui'
import MediaThumbnail from '@/components/library/MediaThumbnail.vue'
import type { MediaRecord } from '@/types'

const GRID_GAP = 12

const libraryStore = useLibraryStore()
const uiStore = useUIStore()
const { handleClick, handleDoubleClick } = useGridSelection()
const { handleDragStart } = useLibraryMediaDrag()

const scrollRef = ref<HTMLDivElement | null>(null)
const contentWidth = ref(0)
const initialScrollRestored = ref(false)

const columnCount = computed(() => {
  if (contentWidth.value <= 0) return 0

  return Math.max(
    1,
    Math.floor((contentWidth.value + GRID_GAP) / (uiStore.thumbnailSize + GRID_GAP))
  )
})

const rowCount = computed(() => {
  if (columnCount.value === 0) return 0
  return Math.ceil(libraryStore.items.length / columnCount.value)
})

const rowHeight = computed(() => {
  if (columnCount.value === 0 || contentWidth.value <= 0) {
    return uiStore.thumbnailSize + GRID_GAP
  }

  const columnWidth = (contentWidth.value - GRID_GAP * (columnCount.value - 1)) / columnCount.value
  return columnWidth + GRID_GAP
})

const virtualizer = useVirtualizer(
  computed(() => ({
    count: rowCount.value,
    getScrollElement: () => scrollRef.value,
    estimateSize: () => rowHeight.value,
    overscan: GRID_BUFFER_ROWS
  }))
)

const virtualRows = computed(() => virtualizer.value.getVirtualItems())
const totalSize = computed(() => virtualizer.value.getTotalSize())

watch(rowHeight, () => {
  virtualizer.value.measure()
})

watch([() => libraryStore.focusedId, columnCount, () => libraryStore.items.length], async () => {
  if (initialScrollRestored.value) return
  if (!libraryStore.focusedId || columnCount.value === 0) return

  const index = libraryStore.items.findIndex((item) => item.id === libraryStore.focusedId)
  if (index < 0) return

  await nextTick()
  const rowIndex = Math.floor(index / columnCount.value)
  virtualizer.value.scrollToIndex(rowIndex, { align: 'center' })
  initialScrollRestored.value = true
})

let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  const element = scrollRef.value
  if (!element) return

  const measure = (): void => {
    contentWidth.value = element.clientWidth - 24
  }

  measure()
  resizeObserver = new ResizeObserver(measure)
  resizeObserver.observe(element)
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
})

function getRowItems(rowIndex: number): MediaRecord[] {
  if (columnCount.value === 0) return []

  const start = rowIndex * columnCount.value
  return libraryStore.items.slice(start, start + columnCount.value)
}

async function onDropImport(event: DragEvent): Promise<void> {
  const files = Array.from(event.dataTransfer?.files ?? [])
  const paths = files
    .map((file) => (file as File & { path?: string }).path)
    .filter((path): path is string => typeof path === 'string' && path.length > 0)

  if (paths.length === 0) return

  await window.api.importMedia(paths)
  await libraryStore.loadMedia()
}
</script>

<template>
  <div ref="scrollRef" class="h-full overflow-auto p-3" @dragover.prevent @drop="onDropImport">
    <div
      :style="{
        height: `${totalSize}px`,
        position: 'relative',
        width: '100%'
      }"
    >
      <div
        v-for="virtualRow in virtualRows"
        :key="virtualRow.index"
        :style="{
          position: 'absolute',
          top: '0px',
          left: '0px',
          width: '100%',
          height: `${virtualRow.size - GRID_GAP}px`,
          transform: `translateY(${virtualRow.start}px)`,
          display: 'grid',
          gridTemplateColumns: `repeat(${columnCount}, 1fr)`,
          gap: `${GRID_GAP}px`
        }"
      >
        <MediaThumbnail
          v-for="(media, columnIndex) in getRowItems(virtualRow.index)"
          :key="media.id"
          :media="media"
          :index="virtualRow.index * columnCount + columnIndex"
          :selected="libraryStore.selectedIds.has(media.id)"
          :focused="media.id === libraryStore.focusedId"
          draggable="true"
          @click="(event: MouseEvent) => handleClick(event, media.id)"
          @dragstart="(event: DragEvent) => handleDragStart(event, media.id)"
          @dblclick="
            () => {
              handleDoubleClick(media.id)
              uiStore.setViewMode('loupe')
            }
          "
        />
      </div>
    </div>
  </div>
</template>
