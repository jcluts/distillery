<script setup lang="ts">
import { computed } from 'vue'
import type { TabsItem } from '@nuxt/ui'

import { THUMBNAIL_SIZE_MAX, THUMBNAIL_SIZE_MIN } from '@/lib/constants'
import { useLibraryStore } from '@/stores/library'
import { useUIStore, type ViewMode, type ZoomLevel } from '@/stores/ui'
import type { MediaSortField } from '@/types'

const libraryStore = useLibraryStore()
const uiStore = useUIStore()

type SortOption = {
  label: string
  value: string
  field: MediaSortField
  direction: 'asc' | 'desc'
}

const SORT_OPTIONS: SortOption[] = [
  {
    label: 'Newest',
    value: 'created_at:desc',
    field: 'created_at',
    direction: 'desc'
  },
  {
    label: 'Oldest',
    value: 'created_at:asc',
    field: 'created_at',
    direction: 'asc'
  },
  {
    label: 'Top Rated',
    value: 'rating:desc',
    field: 'rating',
    direction: 'desc'
  },
  {
    label: 'Name A-Z',
    value: 'file_name:asc',
    field: 'file_name',
    direction: 'asc'
  },
  {
    label: 'Name Z-A',
    value: 'file_name:desc',
    field: 'file_name',
    direction: 'desc'
  }
]

const viewModeItems: TabsItem[] = [
  { value: 'grid', icon: 'i-lucide-grid-2x2' },
  { value: 'loupe', icon: 'i-lucide-image' }
]

const zoomItems: TabsItem[] = [
  { value: 'fit', label: 'Fit' },
  { value: 'actual', label: '1:1' }
]

const imageCount = computed(() => libraryStore.total || libraryStore.items.length)
const selectedCount = computed(() => libraryStore.selectedIds.size)

const focusedIndex = computed(() => {
  if (libraryStore.items.length === 0) return -1
  if (!libraryStore.focusedId) return 0

  const index = libraryStore.items.findIndex((item) => item.id === libraryStore.focusedId)
  return index >= 0 ? index : 0
})

const counterLabel = computed(() => {
  if (uiStore.viewMode === 'loupe' && imageCount.value > 0 && focusedIndex.value >= 0) {
    return `${focusedIndex.value + 1} / ${imageCount.value} images`
  }

  return `${imageCount.value} image${imageCount.value === 1 ? '' : 's'}`
})

const selectionSuffix = computed(() => {
  if (selectedCount.value <= 1) return ''
  return ` · ${selectedCount.value} selected`
})

const viewModeModel = computed({
  get: () => uiStore.viewMode,
  set: (value: string | number) => {
    if (value === 'grid' || value === 'loupe') {
      uiStore.setViewMode(value as ViewMode)
    }
  }
})

const zoomModel = computed({
  get: () => uiStore.loupeZoom,
  set: (value: string | number) => {
    if (value === 'fit' || value === 'actual') {
      uiStore.setLoupeZoom(value as ZoomLevel)
    }
  }
})

const sortModel = computed({
  get: () => `${libraryStore.sortField}:${libraryStore.sortDirection}`,
  set: (value: string | number) => {
    if (typeof value !== 'string') return

    const nextOption = SORT_OPTIONS.find((option) => option.value === value)
    if (!nextOption) return

    libraryStore.sortField = nextOption.field
    libraryStore.sortDirection = nextOption.direction
    void libraryStore.loadMedia()
  }
})

function handleThumbnailSizeUpdate(value: number | number[] | undefined): void {
  const nextValue = Array.isArray(value) ? value[0] : value
  if (typeof nextValue === 'number') {
    uiStore.setThumbnailSize(nextValue)
  }
}
</script>

<template>
  <div class="flex shrink-0 items-center gap-3 px-3 py-2 bg-default text-xs">
    <span class="tabular-nums text-muted">{{ counterLabel }}{{ selectionSuffix }}</span>

    <div class="flex-1" />

    <div class="flex items-center gap-2">
      <USelect
        v-model="sortModel"
        :items="SORT_OPTIONS"
        color="neutral"
        variant="subtle"
        :highlight="false"
        size="xs"
        class="w-32"
        trailing-icon="i-lucide-arrow-up-down"
      />

      <div v-if="uiStore.viewMode === 'grid'" class="flex w-28 items-center gap-1.5">
        <UIcon name="i-lucide-image" class="size-3 text-muted" />
        <USlider
          :model-value="uiStore.thumbnailSize"
          :min="THUMBNAIL_SIZE_MIN"
          :max="THUMBNAIL_SIZE_MAX"
          :step="10"
          @update:model-value="handleThumbnailSizeUpdate"
        />
        <UIcon name="i-lucide-image" class="size-4 text-muted" />
      </div>

      <UTabs
        v-else
        v-model="zoomModel"
        :content="false"
        :items="zoomItems"
        variant="pill"
        size="xs"
      />

      <UTabs
        v-model="viewModeModel"
        :content="false"
        :items="viewModeItems"
        variant="pill"
        size="xs"
      />
    </div>
  </div>
</template>
