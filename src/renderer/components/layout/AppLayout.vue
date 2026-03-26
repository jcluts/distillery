<script setup lang="ts">
import LeftSidebar from '@/components/layout/LeftSidebar.vue'
import MainContent from '@/components/layout/MainContent.vue'
import RightSidebar from '@/components/layout/RightSidebar.vue'
import TitleBar from '@/components/layout/TitleBar.vue'
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts'

useKeyboardShortcuts()
</script>

<template>
  <div class="flex h-screen w-screen flex-col overflow-hidden bg-default">
    <TitleBar />

    <UMain :ui="{ base: 'flex min-h-0 flex-1 overflow-hidden' }">
      <LeftSidebar />
      <MainContent />
      <RightSidebar />
    </UMain>
  </div>
</template>
