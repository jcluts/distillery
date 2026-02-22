import { create } from 'zustand'
import type { GenerationMode, GenerationRecord, GenerationSubmitInput } from '../types'

// Populated lazily by App.tsx after the window.api bridge is available.
// The store must not import from the renderer module graph to stay side-effect
// free, so callers that use reloadFromGeneration() need the bridge present.
declare const window: Window & { api: import('../types').DistilleryAPI }

// =============================================================================
// Generation Store
// Generation form state + timeline history.
// =============================================================================

/** A reference image entry — either a library media item or an external file path. */
export type RefImage = { kind: 'id'; id: string } | { kind: 'path'; path: string }

interface GenerationState {
  // Active generation mode — controls which endpoints/models are shown
  generationMode: GenerationMode

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
  setGenerationMode: (mode: GenerationMode) => void
  /**
   * Fetch generation record + inputs for `id`, then atomically replace
   * formValues and refImages with the original settings.
   *
   * For library-sourced inputs the already-downsized ref_cache_path is used
   * so the engine re-uses the cached pre-processed image.  External inputs
   * fall back to original_path.  If neither is available the input is skipped.
   */
  reloadFromGeneration: (id: string) => Promise<void>

  // Actions — Timeline
  setGenerations: (generations: GenerationRecord[]) => void
  addGeneration: (generation: GenerationRecord) => void
  updateGeneration: (id: string, updates: Partial<GenerationRecord>) => void
  removeGeneration: (id: string) => void
  clearFailed: () => void

  setDetailGenerationId: (id: string | null) => void

  // Build params for submission
  buildParams: () => GenerationSubmitInput
}

export const useGenerationStore = create<GenerationState>((set, get) => ({
  // Form defaults — populated by DynamicForm's onSetDefaults
  generationMode: 'text-to-image',
  formValues: {},
  refImages: [],
  endpointKey: 'local.flux2-klein-4b.image',

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

  setGenerationMode: (mode) => set({ generationMode: mode }),

  reloadFromGeneration: async (id) => {
    const [gen, inputs] = await Promise.all([
      window.api.timeline.get(id),
      window.api.timeline.getGenerationInputs(id).catch(() => [])
    ])

    if (!gen) return

    // ── Form values ─────────────────────────────────────────────────────────
    // The canonical top-level fields on GenerationRecord are the source of
    // truth for form values.  params_json may contain provider-specific extras
    // (e.g. model config) that should not bleed into the form, so we do NOT
    // spread it.  We only use it to recover extra user-facing keys that have no
    // canonical column — currently none, but this keeps the door open.
    const vals: Record<string, unknown> = {}
    if (gen.prompt != null) vals.prompt = gen.prompt
    if (gen.width && gen.height) vals.size = `${gen.width}*${gen.height}`
    if (gen.steps != null) vals.steps = gen.steps
    if (gen.guidance != null) vals.guidance = gen.guidance
    if (gen.sampling_method != null) vals.sampling_method = gen.sampling_method

    // ── Reference images ────────────────────────────────────────────────────
    // Always restore user intent only:
    //   - Library items  → kind:'id' using media_id  (durable, portable)
    //   - External items → kind:'path' using original_path (original file)
    //
    // ref_cache_path is intentionally ignored here.  The main-process pipeline
    // knows how to find/create cache files from the inputs table; the renderer
    // does not need to carry that path.
    const refImages: RefImage[] = inputs
      .slice()
      .sort((a, b) => a.position - b.position)
      .flatMap((input): RefImage[] => {
        if (input.source_type === 'library' && input.media_id) {
          return [{ kind: 'id', id: input.media_id }]
        }
        if (input.source_type === 'external' && input.original_path) {
          return [{ kind: 'path', path: input.original_path }]
        }
        return []
      })

    set({ formValues: vals, refImages })
  },
  setGenerations: (generations) => set({ generations }),

  addGeneration: (generation) =>
    set((s) => ({ generations: [generation, ...s.generations] })),

  updateGeneration: (id, updates) =>
    set((s) => ({
      generations: s.generations.map((g) => (g.id === id ? { ...g, ...updates } : g))
    })),

  removeGeneration: (id) =>
    set((s) => ({ generations: s.generations.filter((g) => g.id !== id) })),

  clearFailed: () =>
    set((s) => ({
      generations: s.generations.filter((g) => g.status !== 'failed')
    })),

  setDetailGenerationId: (id) => set({ detailGenerationId: id }),

  // Build generation params — decompose size field into width/height for local engine
  buildParams: (): GenerationSubmitInput => {
    const state = get()
    const values = { ...state.formValues }
    const isLocal = state.endpointKey.startsWith('local.')

    // Local engine expects separate width/height — decompose the combined
    // size preset (e.g. "1024*1024") into numeric fields.  Remote providers
    // use their own schema fields (which may include a "size" string) so
    // leave them untouched.
    if (isLocal) {
      if (typeof values.size === 'string' && values.size.includes('*')) {
        const [w, h] = values.size.split('*').map(Number)
        values.width = Number.isFinite(w) ? w : 1024
        values.height = Number.isFinite(h) ? h : 1024
        delete values.size
      }

      // Default width/height if somehow missing
      if (!values.width) values.width = 1024
      if (!values.height) values.height = 1024
    }

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
