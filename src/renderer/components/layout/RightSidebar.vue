<script setup lang="ts">
import { computed } from 'vue'

import { PANEL_ICON_STRIP_WIDTH_PX, RIGHT_PANEL_WIDTH_PX } from '@/lib/layout'
import { useUIStore, type RightPanelTab } from '@/stores/ui'

interface RightTabDefinition {
  id: RightPanelTab
  label: string
  title: string
  description: string
  icon: string
  body: string
}

const uiStore = useUIStore()

const tabs: RightTabDefinition[] = [
  {
    id: 'info',
    label: 'Info',
    title: 'Media Info',
    description: 'Selection-aware metadata returns in a later phase.',
    icon: 'i-lucide-info',
    body: 'The panel structure is live and persistent. Detailed metadata content is deferred until the renderer migration reaches the data-rich side panes.'
  },
  {
    id: 'generation',
    label: 'Generation',
    title: 'Generation Info',
    description: 'Generation-specific metadata returns after the timeline port.',
    icon: 'i-lucide-sliders-horizontal',
    body: 'This placeholder preserves the right-rail interaction model without pulling timeline and modal complexity into the MVP grid foundation.'
  }
]

const activeTab = computed(() => tabs.find((tab) => tab.id === uiStore.rightPanelTab) ?? tabs[0])

function handleTabClick(tab: RightPanelTab): void {
  uiStore.toggleRightPanel(tab)
}
</script>

<template>
  <UDashboardSidebar
    id="right-sidebar"
    side="right"
    resizable
    collapsible
    :collapsed="!uiStore.rightPanelOpen"
    :collapsed-size="PANEL_ICON_STRIP_WIDTH_PX"
    :default-size="RIGHT_PANEL_WIDTH_PX"
    :min-size="240"
    :max-size="420"
  >
    <div class="flex h-full min-w-0 overflow-hidden">
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
        </div>
      </div>

      <div class="flex w-12 shrink-0 flex-col items-center gap-2 border-l px-2 py-3">
        <UButton
          v-for="tab in tabs"
          :key="tab.id"
          :title="tab.label"
          color="neutral"
          :variant="uiStore.rightPanelTab === tab.id ? 'soft' : 'ghost'"
          square
          @click="handleTabClick(tab.id)"
        >
          <UIcon :name="tab.icon" class="size-4" />
        </UButton>
      </div>
    </div>
  </UDashboardSidebar>
</template>
