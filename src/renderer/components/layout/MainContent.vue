<script setup lang="ts">
import FilterBar from '@/components/library/FilterBar.vue'
import GridView from '@/components/library/GridView.vue'
import LoupeView from '@/components/library/LoupeView.vue'
import LibraryStatusBar from '@/components/library/LibraryStatusBar.vue'
import { useUIStore } from '@/stores/ui'

const uiStore = useUIStore()
</script>

<template>
  <section id="main-content" class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-black">
    <FilterBar />
    <div class="min-h-0 flex-1">
      <GridView v-if="uiStore.viewMode === 'grid'" />
      <LoupeView v-else />
    </div>
    <LibraryStatusBar />
  </section>
</template>
