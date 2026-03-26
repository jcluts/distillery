<script setup lang="ts">
import { computed } from 'vue'

import { LEFT_PANEL_WIDTH_PX, PANEL_ICON_STRIP_WIDTH_PX } from '@/lib/layout'
import { useUIStore, type LeftPanelTab } from '@/stores/ui'

const uiStore = useUIStore()
const collapsed = computed(() => !uiStore.leftPanelOpen)

const tabs: { id: LeftPanelTab; icon: string; label: string }[] = [
  { id: 'generation', icon: 'i-lucide-sparkles', label: 'Generate' },
  { id: 'timeline', icon: 'i-lucide-clock-3', label: 'Timeline' },
  { id: 'import', icon: 'i-lucide-download', label: 'Import' }
]
</script>

<template>
  <UDashboardSidebar
    id="left-sidebar"
    resizable
    collapsible
    :collapsed="collapsed"
    :collapsed-size="PANEL_ICON_STRIP_WIDTH_PX"
    :default-size="LEFT_PANEL_WIDTH_PX"
    :min-size="280"
    :max-size="520"
    :ui="{ root: 'min-h-0', body: 'p-0 overflow-hidden' }"
  >
    <div class="flex h-full">
      <div class="flex w-12 shrink-0 flex-col items-center gap-1 pt-2">
        <UButton
          v-for="tab in tabs"
          :key="tab.id"
          :icon="tab.icon"
          :color="uiStore.leftPanelTab === tab.id && !collapsed ? 'primary' : 'neutral'"
          variant="ghost"
          square
          :aria-label="tab.label"
          @click="uiStore.toggleLeftPanel(tab.id)"
        />
      </div>

      <div v-if="!collapsed" class="min-w-0 flex-1 overflow-y-auto" />
    </div>
  </UDashboardSidebar>
</template>
