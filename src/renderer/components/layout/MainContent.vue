<script setup lang="ts">
import GridView from '@/components/library/GridView.vue'
import LibraryStatusBar from '@/components/library/LibraryStatusBar.vue'
</script>

<template>
  <UDashboardPanel
    id="main-content"
    resizable
    :ui="{ root: 'min-h-0 flex-1' }"
  >
    <div class="flex h-full flex-col">
      <div class="min-h-0 flex-1">
        <GridView />
      </div>
      <LibraryStatusBar />
    </div>
  </UDashboardPanel>
</template>
