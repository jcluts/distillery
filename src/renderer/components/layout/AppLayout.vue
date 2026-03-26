<script setup lang="ts">
import LeftSidebar from '@/components/layout/LeftSidebar.vue'
import MainContent from '@/components/layout/MainContent.vue'
import RightSidebar from '@/components/layout/RightSidebar.vue'
import TitleBar from '@/components/layout/TitleBar.vue'
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts'

useKeyboardShortcuts()
</script>

<template>
  <div class="flex h-screen w-screen flex-col overflow-hidden">
    <TitleBar />

    <UDashboardGroup
      unit="px"
      storage-key="distillery-layout"
      :persistent="false"
      class="min-h-0 flex-1"
    >
      <LeftSidebar />
      <MainContent />
      <RightSidebar />
    </UDashboardGroup>
  </div>
</template>
