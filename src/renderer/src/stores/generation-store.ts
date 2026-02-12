import { create } from 'zustand'
import type { GenerationRecord, GenerationParams } from '../types'
import { GENERATION_DEFAULTS, ASPECT_RATIOS, type AspectRatioLabel } from '../lib/constants'

// =============================================================================
// Generation Store
// Generation form state + timeline history.
// =============================================================================

interface GenerationState {
  // Form state
  prompt: string
  refImageIds: string[]
  refImagePaths: string[] // for external images
  resolution: number
  aspectRatio: AspectRatioLabel
  steps: number
  guidance: number
  samplingMethod: string

  // Timeline
  generations: GenerationRecord[]

  // Actions - Form
  setPrompt: (prompt: string) => void
  addRefImage: (id: string) => void
  removeRefImage: (id: string) => void
  addRefImagePath: (path: string) => void
  removeRefImagePath: (path: string) => void
  clearRefImages: () => void
  setResolution: (resolution: number) => void
  setAspectRatio: (ratio: AspectRatioLabel) => void
  setSteps: (steps: number) => void
  setGuidance: (guidance: number) => void
  setSamplingMethod: (method: string) => void
  resetForm: () => void

  // Actions - Timeline
  setGenerations: (generations: GenerationRecord[]) => void
  addGeneration: (generation: GenerationRecord) => void
  updateGeneration: (id: string, updates: Partial<GenerationRecord>) => void
  removeGeneration: (id: string) => void
  clearCompleted: () => void

  // Build params for submission
  buildParams: () => GenerationParams
}

export const useGenerationStore = create<GenerationState>((set, get) => ({
  // Form defaults
  prompt: '',
  refImageIds: [],
  refImagePaths: [],
  resolution: GENERATION_DEFAULTS.resolution,
  aspectRatio: GENERATION_DEFAULTS.aspectRatio,
  steps: GENERATION_DEFAULTS.steps,
  guidance: GENERATION_DEFAULTS.guidance,
  samplingMethod: GENERATION_DEFAULTS.sampling_method,

  // Timeline
  generations: [],

  // Form actions
  setPrompt: (prompt) => set({ prompt }),
  addRefImage: (id) =>
    set((s) => ({
      refImageIds: s.refImageIds.includes(id) ? s.refImageIds : [...s.refImageIds, id]
    })),
  removeRefImage: (id) =>
    set((s) => ({ refImageIds: s.refImageIds.filter((i) => i !== id) })),
  addRefImagePath: (path) =>
    set((s) => ({
      refImagePaths: s.refImagePaths.includes(path)
        ? s.refImagePaths
        : [...s.refImagePaths, path]
    })),
  removeRefImagePath: (path) =>
    set((s) => ({ refImagePaths: s.refImagePaths.filter((p) => p !== path) })),
  clearRefImages: () => set({ refImageIds: [], refImagePaths: [] }),
  setResolution: (resolution) => set({ resolution }),
  setAspectRatio: (aspectRatio) => set({ aspectRatio }),
  setSteps: (steps) => set({ steps }),
  setGuidance: (guidance) => set({ guidance }),
  setSamplingMethod: (method) => set({ samplingMethod: method }),
  resetForm: () =>
    set({
      prompt: '',
      refImageIds: [],
      refImagePaths: [],
      resolution: GENERATION_DEFAULTS.resolution,
      aspectRatio: GENERATION_DEFAULTS.aspectRatio,
      steps: GENERATION_DEFAULTS.steps,
      guidance: GENERATION_DEFAULTS.guidance,
      samplingMethod: GENERATION_DEFAULTS.sampling_method
    }),

  // Timeline actions
  setGenerations: (generations) => set({ generations }),
  addGeneration: (generation) =>
    set((s) => ({ generations: [generation, ...s.generations] })),
  updateGeneration: (id, updates) =>
    set((s) => ({
      generations: s.generations.map((g) =>
        g.id === id ? { ...g, ...updates } : g
      )
    })),
  removeGeneration: (id) =>
    set((s) => ({ generations: s.generations.filter((g) => g.id !== id) })),
  clearCompleted: () =>
    set((s) => ({
      generations: s.generations.filter((g) => g.status !== 'completed')
    })),

  // Build generation params
  buildParams: (): GenerationParams => {
    const state = get()
    const ratio = ASPECT_RATIOS.find(
      (r) => r.label === state.aspectRatio
    )
    const ratioW = ratio?.width ?? 1
    const ratioH = ratio?.height ?? 1

    let width: number, height: number
    if (ratioW >= ratioH) {
      width = state.resolution
      height = Math.round((state.resolution * ratioH) / ratioW)
    } else {
      height = state.resolution
      width = Math.round((state.resolution * ratioW) / ratioH)
    }

    return {
      prompt: state.prompt,
      width,
      height,
      steps: state.steps,
      guidance: state.guidance,
      sampling_method: state.samplingMethod,
      ref_image_ids: state.refImageIds.length > 0 ? state.refImageIds : undefined,
      ref_image_paths: state.refImagePaths.length > 0 ? state.refImagePaths : undefined
    }
  }
}))
