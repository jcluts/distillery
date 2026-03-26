<script setup lang="ts">
import GridView from '@/components/library/GridView.vue'
import LibraryStatusBar from '@/components/library/LibraryStatusBar.vue'
import { useUIStore } from '@/stores/ui'
</script>

<template>
  <UDashboardPanel id="main-content" resizable>
    <div class="flex h-full min-w-0 flex-col overflow-hidden">
      <div class="min-h-0 flex-1 overflow-hidden">
        <GridView v-if="useUIStore().viewMode === 'grid'" />

        <div v-else class="flex h-full items-center justify-center px-6 text-center">
          <div class="max-w-md space-y-2">
            <h2 class="text-base font-medium">Loupe View Is Deferred</h2>
            <p class="text-sm leading-6 text-muted-foreground">
              The migrated shell already tracks focus and view mode, but the canvas-based loupe
              implementation remains outside phase 3.
            </p>
          </div>
        </div>
      </div>

      <LibraryStatusBar />
    </div>
  </UDashboardPanel>
</template>
