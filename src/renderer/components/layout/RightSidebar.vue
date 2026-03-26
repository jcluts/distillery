<script setup lang="ts">
import { computed } from 'vue'

import { PANEL_ICON_STRIP_WIDTH_PX, RIGHT_PANEL_WIDTH_PX } from '@/lib/layout'
import GenerationInfoPane from '@/components/panes/GenerationInfoPane.vue'
import MediaInfoPane from '@/components/panes/MediaInfoPane.vue'
import { useUIStore, type RightPanelTab } from '@/stores/ui'

const uiStore = useUIStore()
const collapsed = computed(() => !uiStore.rightPanelOpen)

const tabs: { id: RightPanelTab; icon: string; label: string }[] = [
  { id: 'info', icon: 'i-lucide-info', label: 'Info' },
  { id: 'generation', icon: 'i-lucide-sliders-horizontal', label: 'Generation' }
]

const activePaneComponent = computed(() => {
  switch (uiStore.rightPanelTab) {
    case 'generation':
      return GenerationInfoPane
    default:
      return MediaInfoPane
  }
})
</script>

<template>
  <aside
    id="right-sidebar"
    class="flex h-full shrink-0 border-l border-default bg-default transition-[width] duration-150 ease-linear"
    :style="{ width: `${collapsed ? PANEL_ICON_STRIP_WIDTH_PX : RIGHT_PANEL_WIDTH_PX}px` }"
  >
    <div class="flex h-full w-full">
      <div v-if="!collapsed" class="min-w-0 flex-1 overflow-hidden border-r border-default">
        <component :is="activePaneComponent" />
      </div>

      <div class="ms-auto flex w-12 shrink-0 flex-col items-center gap-1 pt-2">
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
  </aside>
</template>
