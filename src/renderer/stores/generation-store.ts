import { create } from 'zustand'
import type { GenerationRecord, GenerationSubmitInput } from '../types'

// =============================================================================
// Generation Store
// Generation form state + timeline history.
// =============================================================================

/** A reference image entry — either a library media item or an external file path. */
export type RefImage = { kind: 'id'; id: string } | { kind: 'path'; path: string }

interface GenerationState {
  // Dynamic form values keyed by schema property name
  formValues: Record<string, unknown>

  // Reference images — unified ordered list (library items and/or external paths)
  refImages: RefImage[]

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
  addRefImage: (image: RefImage) => void
  removeRefImageAt: (index: number) => void
  replaceRefImageAt: (index: number, image: RefImage) => void
  reorderRefImages: (from: number, to: number) => void
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
  refImages: [],
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
    set({ formValues: {}, refImages: [] }),

  addRefImage: (image) =>
    set((s) => {
      // Deduplicate by id for library items
      if (image.kind === 'id' && s.refImages.some((r) => r.kind === 'id' && r.id === image.id)) {
        return s
      }
      return { refImages: [...s.refImages, image] }
    }),

  removeRefImageAt: (index) =>
    set((s) => ({ refImages: s.refImages.filter((_, i) => i !== index) })),

  replaceRefImageAt: (index, image) =>
    set((s) => {
      const next = [...s.refImages]
      next[index] = image
      return { refImages: next }
    }),

  reorderRefImages: (from, to) =>
    set((s) => {
      const next = [...s.refImages]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return { refImages: next }
    }),

  clearRefImages: () => set({ refImages: [] }),

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

    // Attach reference images — split unified list back into ids/paths
    const refImageIds = state.refImages.filter((r) => r.kind === 'id').map((r) => r.id)
    const refImagePaths = state.refImages.filter((r) => r.kind === 'path').map((r) => r.path)
    if (refImageIds.length > 0) values.ref_image_ids = refImageIds
    if (refImagePaths.length > 0) values.ref_image_paths = refImagePaths

    return {
      endpointKey: state.endpointKey,
      params: values as GenerationSubmitInput['params']
    }
  }
}))
