import { create } from 'zustand'
import type {
  UpscaleModelInfo,
  UpscaleVariant,
  UpscaleProgressEvent,
  UpscaleResultEvent
} from '../types'
import { useLibraryStore } from './library-store'

interface UpscaleState {
  models: UpscaleModelInfo[]
  variants: UpscaleVariant[]
  activeVariantId: string | null
  selectedModelId: string | null
  selectedScale: number
  isUpscaling: boolean
  progressPhase: string | null
  progressMessage: string | null

  loadModels: () => Promise<void>
  loadUpscaleData: (mediaId: string) => Promise<void>
  clearUpscaleData: () => void
  submit: (mediaId: string) => Promise<void>
  setActive: (mediaId: string, variantId: string | null) => Promise<void>
  deleteVariant: (variantId: string, mediaId: string) => Promise<void>
  deleteAll: (mediaId: string) => Promise<void>
  setSelectedModelId: (id: string) => void
  setSelectedScale: (scale: number) => void
  handleProgress: (event: UpscaleProgressEvent) => void
  handleResult: (event: UpscaleResultEvent) => void
}

export const useUpscaleStore = create<UpscaleState>((set, get) => ({
  models: [],
  variants: [],
  activeVariantId: null,
  selectedModelId: null,
  selectedScale: 4,
  isUpscaling: false,
  progressPhase: null,
  progressMessage: null,

  loadModels: async () => {
    try {
      const models = await window.api.upscale.getModels()
      const availableModels = models.filter((m) => m.available)
      set({ models: availableModels })
      // Auto-select first model if none selected
      if (!get().selectedModelId && availableModels.length > 0) {
        set({ selectedModelId: availableModels[0].id })
      }
    } catch {
      // ignore
    }
  },

  loadUpscaleData: async (mediaId: string) => {
    try {
      const data = await window.api.upscale.getData(mediaId)
      set({
        variants: data.variants,
        activeVariantId: data.activeVariantId
      })
    } catch {
      // ignore
    }
  },

  clearUpscaleData: () => {
    set({ variants: [], activeVariantId: null })
  },

  submit: async (mediaId: string) => {
    const { selectedModelId, selectedScale } = get()
    if (!selectedModelId) return

    set({ isUpscaling: true, progressPhase: 'preparing', progressMessage: null })
    try {
      await window.api.upscale.submit({
        mediaId,
        modelId: selectedModelId,
        scaleFactor: selectedScale
      })
    } catch {
      set({ isUpscaling: false, progressPhase: null })
    }
  },

  setActive: async (mediaId: string, variantId: string | null) => {
    try {
      await window.api.upscale.setActive(mediaId, variantId)
      set({ activeVariantId: variantId })
      // Re-fetch media record so working_file_path updates in the library store
      const updated = await window.api.getMediaById(mediaId)
      if (updated) {
        useLibraryStore.getState().updateItem(mediaId, {
          active_upscale_id: updated.active_upscale_id,
          working_file_path: updated.working_file_path ?? null
        })
      }
    } catch {
      // ignore
    }
  },

  deleteVariant: async (variantId: string, mediaId: string) => {
    try {
      await window.api.upscale.deleteVariant(variantId)
      await get().loadUpscaleData(mediaId)
      // Re-fetch media record so working_file_path updates in the library store
      const updated = await window.api.getMediaById(mediaId)
      if (updated) {
        useLibraryStore.getState().updateItem(mediaId, {
          active_upscale_id: updated.active_upscale_id,
          working_file_path: updated.working_file_path ?? null
        })
      }
    } catch {
      // ignore
    }
  },

  deleteAll: async (mediaId: string) => {
    try {
      await window.api.upscale.deleteAll(mediaId)
      set({ variants: [], activeVariantId: null })
      useLibraryStore.getState().updateItem(mediaId, {
        active_upscale_id: null,
        working_file_path: null
      })
    } catch {
      // ignore
    }
  },

  setSelectedModelId: (id: string) => set({ selectedModelId: id }),

  setSelectedScale: (scale: number) => set({ selectedScale: scale }),

  handleProgress: (event: UpscaleProgressEvent) => {
    if (event.phase === 'complete' || event.phase === 'error') {
      set({
        isUpscaling: false,
        progressPhase: null,
        progressMessage: null
      })
    } else {
      set({
        isUpscaling: true,
        progressPhase: event.phase,
        progressMessage: event.message ?? null
      })
    }
  },

  handleResult: (event: UpscaleResultEvent) => {
    set({ isUpscaling: false, progressPhase: null, progressMessage: null })
    if (event.success && event.variant) {
      set((state) => ({
        variants: [event.variant!, ...state.variants],
        activeVariantId: event.variant!.id
      }))
    }
  }
}))
