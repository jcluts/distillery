<script setup lang="ts">
import { computed } from 'vue'

import { PANEL_ICON_STRIP_WIDTH_PX, RIGHT_PANEL_WIDTH_PX } from '@/lib/layout'
import CollectionsPane from '@/components/panes/CollectionsPane.vue'
import GenerationInfoPane from '@/components/panes/GenerationInfoPane.vue'
import MediaInfoPane from '@/components/panes/MediaInfoPane.vue'
import RemovalPane from '@/components/panes/RemovalPane.vue'
import TransformPane from '@/components/panes/TransformPane.vue'
import { useUIStore, type RightPanelTab } from '@/stores/ui'

const uiStore = useUIStore()
const collapsed = computed(() => !uiStore.rightPanelOpen)

const tabs: { id: RightPanelTab; icon: string; label: string }[] = [
  { id: 'info', icon: 'i-lucide-info', label: 'Info' },
  { id: 'collections', icon: 'i-lucide-layers-3', label: 'Collections' },
  { id: 'transform', icon: 'i-lucide-crop', label: 'Transform' },
  { id: 'removal', icon: 'i-lucide-eraser', label: 'Removals' }
]

const activePaneComponent = computed(() => {
  switch (uiStore.rightPanelTab) {
    case 'generation':
      return GenerationInfoPane
    case 'collections':
      return CollectionsPane
    case 'transform':
      return TransformPane
    case 'removal':
      return RemovalPane
    default:
      return MediaInfoPane
  }
})
</script>

<template>
  <aside id="right-sidebar" class="flex h-full shrink-0 bg-default transition-[width] duration-150 ease-linear"
    :style="{ width: `${collapsed ? PANEL_ICON_STRIP_WIDTH_PX : RIGHT_PANEL_WIDTH_PX}px` }">
    <div class="flex h-full w-full">
      <div v-if="!collapsed" class="min-w-0 flex-1 overflow-hidden">
        <component :is="activePaneComponent" />
      </div>

      <div class="ms-auto flex w-12 shrink-0 flex-col items-center gap-1 pt-2 bg-elevated">
        <UButton v-for="tab in tabs" :key="tab.id" :icon="tab.icon"
          :color="uiStore.rightPanelTab === tab.id && !collapsed ? 'primary' : 'neutral'" variant="ghost" square
          :aria-label="tab.label" @click="uiStore.toggleRightPanel(tab.id)" />
      </div>
    </div>
  </aside>
</template>
