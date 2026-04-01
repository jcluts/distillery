<script setup lang="ts">
import { computed } from 'vue'

import { PANEL_ICON_STRIP_WIDTH_PX, RIGHT_PANEL_WIDTH_PX } from '@/lib/layout'
import CollectionsPane from '@/components/panes/CollectionsPane.vue'
import AdjustmentsPane from '@/components/panes/AdjustmentsPane.vue'
import GenerationInfoPane from '@/components/panes/GenerationInfoPane.vue'
import MediaInfoPane from '@/components/panes/MediaInfoPane.vue'
import RemovalPane from '@/components/panes/RemovalPane.vue'
import TransformPane from '@/components/panes/TransformPane.vue'
import UpscalePane from '@/components/panes/UpscalePane.vue'
import VideoEditPane from '@/components/panes/VideoEditPane.vue'
import SidebarIconRail, { type SidebarTab } from '@/components/layout/SidebarIconRail.vue'
import { useUIStore, type RightPanelTab } from '@/stores/ui'

const uiStore = useUIStore()
const collapsed = computed(() => !uiStore.rightPanelOpen)

const tabs: SidebarTab[] = [
  { id: 'info', icon: 'lucide:info', label: 'Info' },
  { id: 'generation', icon: 'lucide:sparkles', label: 'Generation' },
  { id: 'collections', icon: 'lucide:layers-3', label: 'Collections' },
  { id: 'transform', icon: 'lucide:crop', label: 'Transform' },
  { id: 'adjustments', icon: 'lucide:sliders-horizontal', label: 'Adjustments' },
  { id: 'removal', icon: 'lucide:eraser', label: 'Removals' },
  { id: 'upscale', icon: 'lucide:maximize-2', label: 'Upscale' },
  { id: 'videoEdit', icon: 'lucide:scissors', label: 'Video' }
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
    case 'upscale':
      return UpscalePane
    case 'videoEdit':
      return VideoEditPane
    default:
      return MediaInfoPane
  }
})
</script>

<template>
  <aside id="right-sidebar" class="flex h-full shrink-0 transition-[width] duration-150 ease-linear bg-surface-950"
    :style="{ width: `${collapsed ? PANEL_ICON_STRIP_WIDTH_PX : RIGHT_PANEL_WIDTH_PX}px` }">
    <div class="flex h-full w-full">
      <div v-if="!collapsed" class="min-w-0 flex-1 overflow-hidden">
        <component :is="activePaneComponent" />
      </div>

      <SidebarIconRail
        class="ms-auto"
        :tabs="tabs"
        :active-tab="uiStore.rightPanelTab"
        :active="!collapsed"
        @select="(id) => uiStore.toggleRightPanel(id as RightPanelTab)"
      />
    </div>
  </aside>
</template>
