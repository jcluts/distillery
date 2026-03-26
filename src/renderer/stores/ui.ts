import { defineStore } from 'pinia'
import { ref } from 'vue'

import { THUMBNAIL_SIZE_DEFAULT, THUMBNAIL_SIZE_MAX, THUMBNAIL_SIZE_MIN } from '@/lib/constants'
import { LEFT_PANEL_WIDTH_PX, RIGHT_PANEL_WIDTH_PX } from '@/lib/layout'
import type { AppSettings } from '@/types'

export type ViewMode = 'grid' | 'loupe'
export type LeftPanelTab = 'generation' | 'timeline' | 'import'
export type RightPanelTab = 'info' | 'generation'

const LEFT_PANEL_TABS: LeftPanelTab[] = ['generation', 'timeline', 'import']
const RIGHT_PANEL_TABS: RightPanelTab[] = ['info', 'generation']
const VIEW_MODES: ViewMode[] = ['grid', 'loupe']

function clampThumbnailSize(size: number): number {
  return Math.min(THUMBNAIL_SIZE_MAX, Math.max(THUMBNAIL_SIZE_MIN, Math.round(size)))
}

function isLeftPanelTab(value: string): value is LeftPanelTab {
  return LEFT_PANEL_TABS.includes(value as LeftPanelTab)
}

function isRightPanelTab(value: string): value is RightPanelTab {
  return RIGHT_PANEL_TABS.includes(value as RightPanelTab)
}

function isViewMode(value: string): value is ViewMode {
  return VIEW_MODES.includes(value as ViewMode)
}

export const useUIStore = defineStore('ui', () => {
  const leftPanelOpen = ref(true)
  const leftPanelTab = ref<LeftPanelTab>('generation')
  const leftPanelWidth = ref(LEFT_PANEL_WIDTH_PX)

  const rightPanelOpen = ref(true)
  const rightPanelTab = ref<RightPanelTab>('info')
  const rightPanelWidth = ref(RIGHT_PANEL_WIDTH_PX)

  const viewMode = ref<ViewMode>('grid')
  const thumbnailSize = ref(THUMBNAIL_SIZE_DEFAULT)
  const settingsLoaded = ref(false)

  async function persistSettings(): Promise<void> {
    if (!settingsLoaded.value) return

    try {
      await window.api.saveSettings({
        left_panel_open: leftPanelOpen.value,
        left_panel_tab: leftPanelTab.value,
        right_panel_open: rightPanelOpen.value,
        right_panel_tab: rightPanelTab.value,
        thumbnail_size: thumbnailSize.value,
        view_mode: viewMode.value
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
    leftPanelWidth.value = settings.left_panel_width || LEFT_PANEL_WIDTH_PX

    rightPanelOpen.value = settings.right_panel_open
    rightPanelTab.value = isRightPanelTab(settings.right_panel_tab)
      ? settings.right_panel_tab
      : settings.right_panel_tab === 'generation-info'
        ? 'generation'
        : 'info'
    rightPanelWidth.value = settings.right_panel_width || RIGHT_PANEL_WIDTH_PX

    viewMode.value = isViewMode(settings.view_mode) ? settings.view_mode : 'grid'
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
    void persistSettings()
  }

  function setThumbnailSize(size: number): void {
    thumbnailSize.value = clampThumbnailSize(size)
    void persistSettings()
  }

  return {
    leftPanelOpen,
    leftPanelTab,
    leftPanelWidth,
    rightPanelOpen,
    rightPanelTab,
    rightPanelWidth,
    viewMode,
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
    setThumbnailSize
  }
})
