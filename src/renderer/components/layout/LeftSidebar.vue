<script setup lang="ts">
import { computed } from 'vue'

import { LEFT_PANEL_WIDTH_PX, PANEL_ICON_STRIP_WIDTH_PX } from '@/lib/layout'
import LeftSidebarStatusBar from '@/components/layout/LeftSidebarStatusBar.vue'
import { useUIStore, type LeftPanelTab } from '@/stores/ui'

interface LeftTabDefinition {
  id: LeftPanelTab
  label: string
  title: string
  description: string
  icon: string
  body: string
}

const uiStore = useUIStore()

const tabs: LeftTabDefinition[] = [
  {
    id: 'generation',
    label: 'Generate',
    title: 'Generation',
    description: 'Prompt controls return in a later phase.',
    icon: 'i-lucide-sparkles',
    body: 'This panel is intentionally minimal in the Vue foundation. It reserves the generation workflow without dragging phase 3 into form migration work.'
  },
  {
    id: 'timeline',
    label: 'Timeline',
    title: 'Timeline',
    description: 'Generation history comes back after the core shell is stable.',
    icon: 'i-lucide-clock-3',
    body: 'Timeline content is deferred. The tab wiring, persistence, and panel structure are in place so later phases can slot the real implementation in without reworking layout.'
  },
  {
    id: 'import',
    label: 'Import',
    title: 'Import',
    description: 'The library already accepts drag-and-drop on the grid.',
    icon: 'i-lucide-download',
    body: 'Direct file drop into the grid is active now. The dedicated import panel returns later with folder and batch workflows.'
  }
]

const activeTab = computed(() => tabs.find((tab) => tab.id === uiStore.leftPanelTab) ?? tabs[0])

function handleTabClick(tab: LeftPanelTab): void {
  uiStore.toggleLeftPanel(tab)
}
</script>

<template>
  <UDashboardSidebar
    id="left-sidebar"
    resizable
    collapsible
    :collapsed="!uiStore.leftPanelOpen"
    :collapsed-size="PANEL_ICON_STRIP_WIDTH_PX"
    :default-size="LEFT_PANEL_WIDTH_PX"
    :min-size="280"
    :max-size="520"
  >
    <div class="flex h-full min-w-0 overflow-hidden">
      <div class="flex w-12 shrink-0 flex-col items-center gap-2 border-r px-2 py-3">
        <UButton
          v-for="tab in tabs"
          :key="tab.id"
          :title="tab.label"
          color="neutral"
          :variant="uiStore.leftPanelTab === tab.id ? 'soft' : 'ghost'"
          square
          @click="handleTabClick(tab.id)"
        >
          <UIcon :name="tab.icon" class="size-4" />
        </UButton>
      </div>

      <div class="min-w-0 flex-1 overflow-hidden">
        <div class="flex h-full min-w-0 flex-col overflow-hidden">
          <div class="border-b px-4 py-3">
            <h2 class="truncate text-sm font-medium">{{ activeTab.title }}</h2>
            <p class="mt-1 text-xs text-muted-foreground">
              {{ activeTab.description }}
            </p>
          </div>

          <div class="min-h-0 flex-1 overflow-auto px-4 py-4">
            <p class="text-sm leading-6 text-muted-foreground">
              {{ activeTab.body }}
            </p>
          </div>

          <LeftSidebarStatusBar />
        </div>
      </div>
    </div>
  </UDashboardSidebar>
</template>
