import { create } from 'zustand'
import type { GenerationRecord, GenerationSubmitInput } from '../types'

// =============================================================================
// Generation Store
// Generation form state + timeline history.
// =============================================================================

interface GenerationState {
  // Dynamic form values keyed by schema property name
  formValues: Record<string, unknown>

  // Reference images (managed separately from the schema-driven form)
  refImageIds: string[]
  refImagePaths: string[]

  // Active endpoint key
  endpointKey: string

  // Timeline
  generations: GenerationRecord[]

  // UI
  detailGenerationId: string | null

  // Actions — Form
  setFormValue: (key: string, value: unknown) => void
  setFormValues: (values: Record<string, unknown>) => void
  resetFormValues: () => void
  addRefImage: (id: string) => void
  removeRefImage: (id: string) => void
  addRefImagePath: (path: string) => void
  removeRefImagePath: (path: string) => void
  clearRefImages: () => void
  setEndpointKey: (key: string) => void

  // Actions — Timeline
  setGenerations: (generations: GenerationRecord[]) => void
  addGeneration: (generation: GenerationRecord) => void
  updateGeneration: (id: string, updates: Partial<GenerationRecord>) => void
  removeGeneration: (id: string) => void
  clearCompleted: () => void

  setDetailGenerationId: (id: string | null) => void

  // Build params for submission
  buildParams: () => GenerationSubmitInput
}

export const useGenerationStore = create<GenerationState>((set, get) => ({
  // Form defaults — populated by DynamicForm's onSetDefaults
  formValues: {},
  refImageIds: [],
  refImagePaths: [],
  endpointKey: 'local.flux2-klein.image',

  // Timeline
  generations: [],

  detailGenerationId: null,

  // Form actions
  setFormValue: (key, value) =>
    set((s) => ({ formValues: { ...s.formValues, [key]: value } })),

  setFormValues: (values) =>
    set((s) => ({ formValues: { ...s.formValues, ...values } })),

  resetFormValues: () =>
    set({ formValues: {}, refImageIds: [], refImagePaths: [] }),

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

  setEndpointKey: (key) => set({ endpointKey: key }),

  // Timeline actions
  setGenerations: (generations) => set({ generations }),

  addGeneration: (generation) =>
    set((s) => ({ generations: [generation, ...s.generations] })),

  updateGeneration: (id, updates) =>
    set((s) => ({
      generations: s.generations.map((g) => (g.id === id ? { ...g, ...updates } : g))
    })),

  removeGeneration: (id) =>
    set((s) => ({ generations: s.generations.filter((g) => g.id !== id) })),

  clearCompleted: () =>
    set((s) => ({
      generations: s.generations.filter((g) => g.status !== 'completed')
    })),

  setDetailGenerationId: (id) => set({ detailGenerationId: id }),

  // Build generation params — decompose size field into width/height
  buildParams: (): GenerationSubmitInput => {
    const state = get()
    const values = { ...state.formValues }

    // Decompose size → width + height
    if (typeof values.size === 'string' && values.size.includes('*')) {
      const [w, h] = values.size.split('*').map(Number)
      values.width = Number.isFinite(w) ? w : 1024
      values.height = Number.isFinite(h) ? h : 1024
      delete values.size
    }

    // Default width/height if somehow missing
    if (!values.width) values.width = 1024
    if (!values.height) values.height = 1024

    // Attach reference images
    if (state.refImageIds.length > 0) {
      values.ref_image_ids = state.refImageIds
    }
    if (state.refImagePaths.length > 0) {
      values.ref_image_paths = state.refImagePaths
    }

    return {
      endpointKey: state.endpointKey,
      params: values as GenerationSubmitInput['params']
    }
  }
}))
