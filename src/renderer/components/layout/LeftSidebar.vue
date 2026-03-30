<script setup lang="ts">
import { computed } from 'vue'

import { LEFT_PANEL_WIDTH_PX, PANEL_ICON_STRIP_WIDTH_PX } from '@/lib/layout'
import GenerationPane from '@/components/panes/GenerationPane.vue'
import ImportPane from '@/components/panes/ImportPane.vue'
import TimelinePane from '@/components/panes/TimelinePane.vue'
import SidebarIconRail, { type SidebarTab } from '@/components/layout/SidebarIconRail.vue'
import { useUIStore, type LeftPanelTab } from '@/stores/ui'

const uiStore = useUIStore()
const collapsed = computed(() => !uiStore.leftPanelOpen)

const tabs: SidebarTab[] = [
  { id: 'generation', icon: 'lucide:sparkles', label: 'Generate' },
  { id: 'timeline', icon: 'lucide:clock-3', label: 'Timeline' },
  { id: 'import', icon: 'lucide:download', label: 'Import' }
]

const activePaneComponent = computed(() => {
  switch (uiStore.leftPanelTab) {
    case 'timeline':
      return TimelinePane
    case 'import':
      return ImportPane
    default:
      return GenerationPane
  }
})
</script>

<template>
  <aside
    id="left-sidebar"
    class="flex h-full shrink-0 transition-[width] duration-150 ease-linear bg-surface-950"
    :style="{ width: `${collapsed ? PANEL_ICON_STRIP_WIDTH_PX : LEFT_PANEL_WIDTH_PX}px` }"
  >
    <div class="flex h-full w-full overflow-hidden">
      <SidebarIconRail
        :tabs="tabs"
        :active-tab="uiStore.leftPanelTab"
        :active="!collapsed"
        @select="(id) => uiStore.toggleLeftPanel(id as LeftPanelTab)"
      />

      <div v-if="!collapsed" class="min-w-0 flex-1 overflow-hidden">
        <component :is="activePaneComponent" />
      </div>
    </div>
  </aside>
</template>
