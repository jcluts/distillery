<script setup lang="ts">
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import Button from 'primevue/button'

import { LEFT_PANEL_WIDTH_PX, PANEL_ICON_STRIP_WIDTH_PX } from '@/lib/layout'
import GenerationPane from '@/components/panes/GenerationPane.vue'
import ImportPane from '@/components/panes/ImportPane.vue'
import TimelinePane from '@/components/panes/TimelinePane.vue'
import { useUIStore, type LeftPanelTab } from '@/stores/ui'

const uiStore = useUIStore()
const collapsed = computed(() => !uiStore.leftPanelOpen)

const tabs: { id: LeftPanelTab; icon: string; label: string }[] = [
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
      <div class="flex w-12 shrink-0 flex-col items-center gap-1 pt-2 bg-surface-900">
        <Button
          v-for="tab in tabs"
          :key="tab.id"
          text
          plain
          :severity="uiStore.leftPanelTab === tab.id && !collapsed ? undefined : 'secondary'"
          size="small"
          :aria-label="tab.label"
          @click="uiStore.toggleLeftPanel(tab.id)"
        >
          <Icon :icon="tab.icon" class="size-5" />
        </Button>
      </div>

      <div v-if="!collapsed" class="min-w-0 flex-1 overflow-hidden">
        <component :is="activePaneComponent" />
      </div>
    </div>
  </aside>
</template>
