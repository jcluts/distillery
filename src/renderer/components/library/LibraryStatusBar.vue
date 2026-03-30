<script setup lang="ts">
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import Select from 'primevue/select'
import Slider from 'primevue/slider'
import SelectButton from 'primevue/selectbutton'

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

const viewModeOptions = [
  { icon: 'lucide:grid-2x2', value: 'grid' },
  { icon: 'lucide:image', value: 'loupe' }
]

const zoomOptions = [
  { label: 'Fit', value: 'fit' },
  { label: '1:1', value: 'actual' }
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
  set: (value: string) => {
    if (value === 'grid' || value === 'loupe') {
      uiStore.setViewMode(value as ViewMode)
    }
  }
})

const zoomModel = computed({
  get: () => uiStore.loupeZoom,
  set: (value: string) => {
    if (value === 'fit' || value === 'actual') {
      uiStore.setLoupeZoom(value as ZoomLevel)
    }
  }
})

const sortModel = computed({
  get: () => `${libraryStore.sortField}:${libraryStore.sortDirection}`,
  set: (value: string) => {
    const nextOption = SORT_OPTIONS.find((option) => option.value === value)
    if (!nextOption) return

    libraryStore.sortField = nextOption.field
    libraryStore.sortDirection = nextOption.direction
    void libraryStore.loadMedia()
  }
})

function handleThumbnailSizeUpdate(value: number | number[]): void {
  const v = Array.isArray(value) ? value[0] : value
  if (typeof v === 'number') {
    uiStore.setThumbnailSize(v)
  }
}
</script>

<template>
  <div class="flex shrink-0 items-center gap-3 px-3 py-2 text-xs" style="background: var(--p-surface-950)">
    <span class="tabular-nums" style="color: var(--p-text-muted-color)">{{ counterLabel }}{{ selectionSuffix }}</span>

    <div class="flex-1" />

    <div class="flex items-center gap-2">
      <Select
        v-model="sortModel"
        :options="SORT_OPTIONS"
        option-label="label"
        option-value="value"
        size="small"
        class="w-32"
      />

      <div v-if="uiStore.viewMode === 'grid'" class="flex w-28 items-center gap-1.5">
        <Icon icon="lucide:image" class="size-3" style="color: var(--p-text-muted-color)" />
        <Slider
          :model-value="uiStore.thumbnailSize"
          :min="THUMBNAIL_SIZE_MIN"
          :max="THUMBNAIL_SIZE_MAX"
          :step="10"
          class="flex-1"
          @update:model-value="handleThumbnailSizeUpdate"
        />
        <Icon icon="lucide:image" class="size-4" style="color: var(--p-text-muted-color)" />
      </div>

      <SelectButton
        v-else
        v-model="zoomModel"
        :options="zoomOptions"
        option-label="label"
        option-value="value"
        size="small"
      />

      <SelectButton
        v-model="viewModeModel"
        :options="viewModeOptions"
        option-value="value"
        size="small"
      >
        <template #option="slotProps">
          <Icon :icon="slotProps.option.icon" class="size-4" />
        </template>
      </SelectButton>
    </div>
  </div>
</template>
