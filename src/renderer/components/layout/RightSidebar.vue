<script setup lang="ts">
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import Button from 'primevue/button'

import { PANEL_ICON_STRIP_WIDTH_PX, RIGHT_PANEL_WIDTH_PX } from '@/lib/layout'
import CollectionsPane from '@/components/panes/CollectionsPane.vue'
import AdjustmentsPane from '@/components/panes/AdjustmentsPane.vue'
import GenerationInfoPane from '@/components/panes/GenerationInfoPane.vue'
import MediaInfoPane from '@/components/panes/MediaInfoPane.vue'
import RemovalPane from '@/components/panes/RemovalPane.vue'
import TransformPane from '@/components/panes/TransformPane.vue'
import { useUIStore, type RightPanelTab } from '@/stores/ui'

const uiStore = useUIStore()
const collapsed = computed(() => !uiStore.rightPanelOpen)

const tabs: { id: RightPanelTab; icon: string; label: string }[] = [
  { id: 'info', icon: 'lucide:info', label: 'Info' },
  { id: 'collections', icon: 'lucide:layers-3', label: 'Collections' },
  { id: 'transform', icon: 'lucide:crop', label: 'Transform' },
  { id: 'adjustments', icon: 'lucide:sliders-horizontal', label: 'Adjustments' },
  { id: 'removal', icon: 'lucide:eraser', label: 'Removals' }
]

const activePaneComponent = computed(() => {
  switch (uiStore.rightPanelTab) {
    case 'generation':
      return GenerationInfoPane
    case 'collections':
      return CollectionsPane
    case 'transform':
      return TransformPane
    case 'adjustments':
      return AdjustmentsPane
    case 'removal':
      return RemovalPane
    default:
      return MediaInfoPane
  }
})
</script>

<template>
  <aside id="right-sidebar" class="flex h-full shrink-0 transition-[width] duration-150 ease-linear"
    style="background: var(--p-surface-950)"
    :style="{ width: `${collapsed ? PANEL_ICON_STRIP_WIDTH_PX : RIGHT_PANEL_WIDTH_PX}px` }">
    <div class="flex h-full w-full">
      <div v-if="!collapsed" class="min-w-0 flex-1 overflow-hidden">
        <component :is="activePaneComponent" />
      </div>

      <div class="ms-auto flex w-12 shrink-0 flex-col items-center gap-1 pt-2" style="background: var(--p-surface-900)">
        <Button v-for="tab in tabs" :key="tab.id"
          text
          plain
          :severity="uiStore.rightPanelTab === tab.id && !collapsed ? undefined : 'secondary'"
          size="small"
          :aria-label="tab.label"
          @click="uiStore.toggleRightPanel(tab.id)">
          <Icon :icon="tab.icon" class="size-5" />
        </Button>
      </div>
    </div>
  </aside>
</template>
