<script setup lang="ts">
import { computed } from 'vue'

import { PANEL_ICON_STRIP_WIDTH_PX, RIGHT_PANEL_WIDTH_PX } from '@/lib/layout'
import { useUIStore, type RightPanelTab } from '@/stores/ui'

const uiStore = useUIStore()
const collapsed = computed(() => !uiStore.rightPanelOpen)

const tabs: { id: RightPanelTab; icon: string; label: string }[] = [
  { id: 'info', icon: 'i-lucide-info', label: 'Info' },
  { id: 'generation', icon: 'i-lucide-sliders-horizontal', label: 'Generation' }
]
</script>

<template>
  <UDashboardSidebar
    id="right-sidebar"
    side="right"
    resizable
    collapsible
    :collapsed="collapsed"
    :collapsed-size="PANEL_ICON_STRIP_WIDTH_PX"
    :default-size="RIGHT_PANEL_WIDTH_PX"
    :min-size="240"
    :max-size="420"
    :ui="{ root: 'min-h-0 border-s border-default', body: 'p-0 overflow-hidden' }"
  >
    <div class="flex h-full">
      <div v-if="!collapsed" class="min-w-0 flex-1 overflow-y-auto" />

      <div class="flex w-12 shrink-0 flex-col items-center gap-1 pt-2">
        <UButton
          v-for="tab in tabs"
          :key="tab.id"
          :icon="tab.icon"
          :color="uiStore.rightPanelTab === tab.id && !collapsed ? 'primary' : 'neutral'"
          variant="ghost"
          square
          :aria-label="tab.label"
          @click="uiStore.toggleRightPanel(tab.id)"
        />
      </div>
    </div>
  </UDashboardSidebar>
</template>
