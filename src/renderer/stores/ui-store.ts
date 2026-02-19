import { create } from 'zustand'
import {
  LEFT_PANEL_WIDTH_PX,
  RIGHT_PANEL_WIDTH_PX
} from '@/lib/layout'
import { THUMBNAIL_SIZE_DEFAULT } from '@/lib/constants'

// =============================================================================
// UI Store
// Panel visibility, active tabs, modals, view mode, thumbnail size.
// =============================================================================

export type ViewMode = 'grid' | 'loupe'
export type LeftPanelTab = 'generation' | 'timeline' | 'import'
export type RightPanelTab = 'info' | 'generation-info' | 'collections'
export type ZoomLevel = 'fit' | 'actual'

const ZOOM_LEVELS: ZoomLevel[] = ['fit', 'actual']

interface UIState {
  // Left panel
  leftPanelOpen: boolean
  leftPanelTab: LeftPanelTab
  leftPanelWidth: number

  // Right panel
  rightPanelOpen: boolean
  rightPanelTab: RightPanelTab
  rightPanelWidth: number

  // View
  viewMode: ViewMode
  thumbnailSize: number
  loupeZoom: ZoomLevel

  // Modals
  activeModals: string[]

  // Actions
  setLeftPanelOpen: (open: boolean) => void
  setLeftPanelTab: (tab: LeftPanelTab) => void
  toggleLeftPanel: (tab?: LeftPanelTab) => void
  setLeftPanelWidth: (width: number) => void
  setRightPanelOpen: (open: boolean) => void
  setRightPanelTab: (tab: RightPanelTab) => void
  toggleRightPanel: (tab?: RightPanelTab) => void
  setRightPanelWidth: (width: number) => void
  setViewMode: (mode: ViewMode) => void
  setThumbnailSize: (size: number) => void
  setLoupeZoom: (level: ZoomLevel) => void
  cycleZoom: () => void
  openModal: (id: string) => void
  closeModal: (id: string) => void
  closeAllModals: () => void
}

export const useUIStore = create<UIState>((set, get) => ({
  // Initial state
  leftPanelOpen: true,
  leftPanelTab: 'generation',
  leftPanelWidth: LEFT_PANEL_WIDTH_PX,
  rightPanelOpen: true,
  rightPanelTab: 'collections',
  rightPanelWidth: RIGHT_PANEL_WIDTH_PX,
  viewMode: 'grid',
  thumbnailSize: THUMBNAIL_SIZE_DEFAULT,
  loupeZoom: 'fit',
  activeModals: [],

  // Actions
  setLeftPanelOpen: (open) => set({ leftPanelOpen: open }),
  setLeftPanelTab: (tab) => set({ leftPanelTab: tab, leftPanelOpen: true }),

  toggleLeftPanel: (tab) => {
    const state = get()
    if (tab && tab !== state.leftPanelTab) {
      set({ leftPanelTab: tab, leftPanelOpen: true })
    } else {
      set({ leftPanelOpen: !state.leftPanelOpen })
    }
  },

  setLeftPanelWidth: (width) => set({ leftPanelWidth: width }),
  setRightPanelOpen: (open) => set({ rightPanelOpen: open }),
  setRightPanelTab: (tab) => set({ rightPanelTab: tab, rightPanelOpen: true }),

  toggleRightPanel: (tab) => {
    const state = get()
    if (tab && tab !== state.rightPanelTab) {
      set({ rightPanelTab: tab, rightPanelOpen: true })
    } else {
      set({ rightPanelOpen: !state.rightPanelOpen })
    }
  },

  setRightPanelWidth: (width) => set({ rightPanelWidth: width }),
  setViewMode: (mode) => set({ viewMode: mode, loupeZoom: 'fit' }),
  setThumbnailSize: (size) => set({ thumbnailSize: size }),
  setLoupeZoom: (level) => set({ loupeZoom: level }),
  cycleZoom: () => {
    const current = get().loupeZoom
    const idx = ZOOM_LEVELS.indexOf(current)
    set({ loupeZoom: ZOOM_LEVELS[(idx + 1) % ZOOM_LEVELS.length] })
  },

  openModal: (id) =>
    set((state) => ({
      activeModals: state.activeModals.includes(id)
        ? state.activeModals
        : [...state.activeModals, id]
    })),

  closeModal: (id) =>
    set((state) => ({
      activeModals: state.activeModals.filter((m) => m !== id)
    })),

  closeAllModals: () => set({ activeModals: [] })
}))
