<script setup lang="ts">
import { computed } from 'vue'

import { THUMBNAIL_SIZE_MAX, THUMBNAIL_SIZE_MIN } from '@/lib/constants'
import { useLibraryStore } from '@/stores/library'
import { useUIStore } from '@/stores/ui'

const libraryStore = useLibraryStore()
const uiStore = useUIStore()

const imageCount = computed(() => libraryStore.total || libraryStore.items.length)

function handleThumbnailSizeUpdate(value: number | number[] | undefined): void {
  const nextValue = Array.isArray(value) ? value[0] : value
  if (typeof nextValue === 'number') {
    uiStore.setThumbnailSize(nextValue)
  }
}
</script>

<template>
  <div class="flex shrink-0 items-center gap-3 border-t px-3 py-2 text-xs">
    <span class="tabular-nums text-muted-foreground">
      {{ imageCount }} image{{ imageCount === 1 ? '' : 's' }}
    </span>

    <div class="flex-1" />

    <div class="flex w-28 items-center gap-1.5">
      <UIcon name="i-lucide-image" class="size-3 text-muted-foreground" />
      <USlider
        :model-value="uiStore.thumbnailSize"
        :min="THUMBNAIL_SIZE_MIN"
        :max="THUMBNAIL_SIZE_MAX"
        :step="10"
        @update:model-value="handleThumbnailSizeUpdate"
      />
      <UIcon name="i-lucide-image" class="size-4 text-muted-foreground" />
    </div>
  </div>
</template>
