import { defineStore } from 'pinia'
import { ref } from 'vue'

import { THUMBNAIL_SIZE_DEFAULT, THUMBNAIL_SIZE_MAX, THUMBNAIL_SIZE_MIN } from '@/lib/constants'
import type { AppSettings } from '@/types'

export type ViewMode = 'grid' | 'loupe'
export type ZoomLevel = 'fit' | 'actual'
export type LeftPanelTab = 'generation' | 'timeline' | 'import'
export type RightPanelTab =
  | 'info'
  | 'generation'
  | 'collections'
  | 'transform'
  | 'adjustments'
  | 'removal'
  | 'upscale'
  | 'videoEdit'

const LEFT_PANEL_TABS: LeftPanelTab[] = ['generation', 'timeline', 'import']
const RIGHT_PANEL_TABS: RightPanelTab[] = [
  'info',
  'generation',
  'collections',
  'transform',
  'adjustments',
  'removal',
  'upscale',
  'videoEdit'
]

function clampThumbnailSize(size: number): number {
  return Math.min(THUMBNAIL_SIZE_MAX, Math.max(THUMBNAIL_SIZE_MIN, Math.round(size)))
}

function isLeftPanelTab(value: string): value is LeftPanelTab {
  return LEFT_PANEL_TABS.includes(value as LeftPanelTab)
}

function isRightPanelTab(value: string): value is RightPanelTab {
  return RIGHT_PANEL_TABS.includes(value as RightPanelTab)
}

export const useUIStore = defineStore('ui', () => {
  const leftPanelOpen = ref(true)
  const leftPanelTab = ref<LeftPanelTab>('generation')

  const rightPanelOpen = ref(true)
  const rightPanelTab = ref<RightPanelTab>('info')

  const viewMode = ref<ViewMode>('grid')
  const loupeZoom = ref<ZoomLevel>('fit')
  const thumbnailSize = ref(THUMBNAIL_SIZE_DEFAULT)
  const settingsLoaded = ref(false)

  const activeModals = ref<string[]>([])

  async function persistSettings(): Promise<void> {
    if (!settingsLoaded.value) return

    try {
      await window.api.saveSettings({
        left_panel_open: leftPanelOpen.value,
        left_panel_tab: leftPanelTab.value,
        right_panel_open: rightPanelOpen.value,
        right_panel_tab: rightPanelTab.value,
        thumbnail_size: thumbnailSize.value
      })
    } catch (error) {
      console.warn('[ui-store] Failed to persist UI settings', error)
    }
  }

  function applySettings(settings: AppSettings): void {
    leftPanelOpen.value = settings.left_panel_open
    leftPanelTab.value = isLeftPanelTab(settings.left_panel_tab)
      ? settings.left_panel_tab
      : 'generation'

    rightPanelOpen.value = settings.right_panel_open
    rightPanelTab.value = isRightPanelTab(settings.right_panel_tab)
      ? settings.right_panel_tab
      : 'info'

    viewMode.value = 'grid'
    loupeZoom.value = 'fit'
    thumbnailSize.value = clampThumbnailSize(settings.thumbnail_size || THUMBNAIL_SIZE_DEFAULT)
    settingsLoaded.value = true
  }

  function setLeftPanelOpen(open: boolean): void {
    leftPanelOpen.value = open
    void persistSettings()
  }

  function setLeftPanelTab(tab: LeftPanelTab): void {
    leftPanelTab.value = tab
    leftPanelOpen.value = true
    void persistSettings()
  }

  function toggleLeftPanel(tab?: LeftPanelTab): void {
    if (tab && tab !== leftPanelTab.value) {
      leftPanelTab.value = tab
      leftPanelOpen.value = true
    } else {
      leftPanelOpen.value = !leftPanelOpen.value
    }
    void persistSettings()
  }

  function setRightPanelOpen(open: boolean): void {
    rightPanelOpen.value = open
    void persistSettings()
  }

  function setRightPanelTab(tab: RightPanelTab): void {
    rightPanelTab.value = tab
    rightPanelOpen.value = true
    void persistSettings()
  }

  function toggleRightPanel(tab?: RightPanelTab): void {
    if (tab && tab !== rightPanelTab.value) {
      rightPanelTab.value = tab
      rightPanelOpen.value = true
    } else {
      rightPanelOpen.value = !rightPanelOpen.value
    }
    void persistSettings()
  }

  function setViewMode(mode: ViewMode): void {
    viewMode.value = mode
    loupeZoom.value = 'fit'
    void persistSettings()
  }

  function setLoupeZoom(level: ZoomLevel): void {
    loupeZoom.value = level
  }

  function cycleZoom(): void {
    loupeZoom.value = loupeZoom.value === 'fit' ? 'actual' : 'fit'
  }

  function setThumbnailSize(size: number): void {
    thumbnailSize.value = clampThumbnailSize(size)
    void persistSettings()
  }

  function openModal(id: string): void {
    if (!activeModals.value.includes(id)) {
      activeModals.value = [...activeModals.value, id]
    }
  }

  function closeModal(id: string): void {
    activeModals.value = activeModals.value.filter((m) => m !== id)
  }

  return {
    leftPanelOpen,
    leftPanelTab,
    rightPanelOpen,
    rightPanelTab,
    viewMode,
    loupeZoom,
    thumbnailSize,
    settingsLoaded,
    applySettings,
    setLeftPanelOpen,
    setLeftPanelTab,
    toggleLeftPanel,
    setRightPanelOpen,
    setRightPanelTab,
    toggleRightPanel,
    setViewMode,
    setLoupeZoom,
    cycleZoom,
    setThumbnailSize,
    activeModals,
    openModal,
    closeModal
  }
})
