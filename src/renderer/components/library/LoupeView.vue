<script setup lang="ts">
import { computed, watch } from 'vue'

import LoupeFilmstrip from '@/components/library/LoupeFilmstrip.vue'
import CanvasViewer from '@/components/library/canvas/CanvasViewer.vue'
import { useLibraryStore } from '@/stores/library'
import { useUIStore } from '@/stores/ui'

const libraryStore = useLibraryStore()
const uiStore = useUIStore()

const currentIndex = computed(() => {
  if (libraryStore.items.length === 0) return -1
  if (!libraryStore.focusedId) return 0

  const index = libraryStore.items.findIndex((item) => item.id === libraryStore.focusedId)
  return index >= 0 ? index : 0
})

const currentItem = computed(() => {
  if (currentIndex.value < 0) return null
  return libraryStore.items[currentIndex.value] ?? null
})

watch(
  [() => libraryStore.focusedId, () => libraryStore.items.length],
  () => {
    if (!libraryStore.focusedId && libraryStore.items[0]) {
      libraryStore.selectSingle(libraryStore.items[0].id)
    }
  },
  { immediate: true }
)

function onSelect(id: string): void {
  libraryStore.selectSingle(id)
}
</script>

<template>
  <div class="flex h-full flex-col overflow-hidden">
    <div class="min-h-0 flex-1 overflow-hidden px-4 pt-4 pb-2">
      <CanvasViewer :media="currentItem" :zoom="uiStore.loupeZoom" />
    </div>

    <LoupeFilmstrip :items="libraryStore.items" :current-index="currentIndex" @select="onSelect" />
  </div>
</template>