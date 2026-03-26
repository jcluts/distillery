<script setup lang="ts">
import GridView from '@/components/library/GridView.vue'
import LibraryStatusBar from '@/components/library/LibraryStatusBar.vue'
</script>

<template>
  <section id="main-content" class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-default">
    <div class="min-h-0 flex-1">
      <GridView />
    </div>
    <LibraryStatusBar />
  </section>
</template>
