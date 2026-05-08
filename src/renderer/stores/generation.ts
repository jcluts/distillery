import { defineStore } from 'pinia'
import { computed, nextTick, ref } from 'vue'

import type {
  CanonicalEndpointDef,
  GenerationMode,
  GenerationRecord,
  GenerationSubmitInput,
  MediaRecord
} from '@/types'
import { useModelStore } from '@/stores/model'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RefImagePreview {
  thumbSrc?: string | null
  fileSrc?: string | null
  label?: string | null
}

export type RefImage =
  | ({ kind: 'id'; id: string } & RefImagePreview)
  | ({ kind: 'path'; path: string } & RefImagePreview)

type StoredGenerationParams = Record<string, unknown> & {
  mode?: unknown
  model?: {
    providerId?: unknown
    providerModelId?: unknown
    id?: unknown
  }
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useGenerationStore = defineStore('generation', () => {
  // -- State --
  const generationMode = ref<GenerationMode>('text-to-image')
  const formValues = ref<Record<string, unknown>>({})
  const refImages = ref<RefImage[]>([])
  const endpointKey = ref('local.flux2-klein-4b.image')
  const generations = ref<GenerationRecord[]>([])
  const detailGenerationId = ref<string | null>(null)

  // -- Getters --
  const prompt = computed(() => {
    const v = formValues.value.prompt
    return typeof v === 'string' ? v : ''
  })

  // -- Form actions --
  function setFormValue(key: string, value: unknown): void {
    formValues.value = { ...formValues.value, [key]: value }
  }

  function setFormValues(values: Record<string, unknown>): void {
    formValues.value = { ...formValues.value, ...values }
  }

  function resetFormValues(): void {
    formValues.value = {}
    refImages.value = []
  }

  function addRefImage(image: RefImage): void {
    if (image.kind === 'id' && refImages.value.some((r) => r.kind === 'id' && r.id === image.id)) {
      return
    }
    refImages.value = [...refImages.value, image]
  }

  function removeRefImageAt(index: number): void {
    refImages.value = refImages.value.filter((_, i) => i !== index)
  }

  function replaceRefImageAt(index: number, image: RefImage): void {
    const next = [...refImages.value]
    next[index] = image
    refImages.value = next
  }

  function reorderRefImages(from: number, to: number): void {
    const next = [...refImages.value]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    refImages.value = next
  }

  function clearRefImages(): void {
    refImages.value = []
  }

  function setEndpointKey(key: string): void {
    endpointKey.value = key
  }

  function setGenerationMode(mode: GenerationMode): void {
    generationMode.value = mode
  }

  function refImageFromMedia(media: MediaRecord): RefImage {
    return {
      kind: 'id',
      id: media.id,
      thumbSrc: media.thumb_path,
      fileSrc: media.file_path,
      label: media.file_name
    }
  }

  function parseStoredParams(gen: GenerationRecord): StoredGenerationParams {
    if (!gen.params_json) return {}
    try {
      const parsed = JSON.parse(gen.params_json) as unknown
      return parsed && typeof parsed === 'object' ? (parsed as StoredGenerationParams) : {}
    } catch {
      return {}
    }
  }

  function isGenerationMode(value: unknown): value is GenerationMode {
    return (
      value === 'text-to-image' ||
      value === 'image-to-image' ||
      value === 'text-to-video' ||
      value === 'image-to-video'
    )
  }

  function findEndpointForGeneration(
    endpoints: CanonicalEndpointDef[],
    gen: GenerationRecord,
    stored: StoredGenerationParams,
    mode: GenerationMode
  ): CanonicalEndpointDef | null {
    const providerId =
      typeof stored.model?.providerId === 'string' ? stored.model.providerId : gen.provider
    const providerModelId =
      typeof stored.model?.providerModelId === 'string'
        ? stored.model.providerModelId
        : gen.model_file

    return (
      endpoints.find(
        (ep) =>
          ep.providerId === providerId &&
          ep.providerModelId === providerModelId &&
          ep.modes.includes(mode)
      ) ??
      endpoints.find(
        (ep) =>
          ep.providerId === providerId &&
          ep.modelIdentityId === gen.model_identity_id &&
          ep.modes.includes(mode)
      ) ??
      null
    )
  }

  // -- Reload form from a previous generation --
  async function reloadFromGeneration(id: string): Promise<void> {
    const [gen, inputs] = await Promise.all([
      window.api.timeline.get(id),
      window.api.timeline.getGenerationInputs(id).catch(() => [])
    ])
    if (!gen) return

    const stored = parseStoredParams(gen)
    const restoredMode = isGenerationMode(stored.mode) ? stored.mode : generationMode.value
    const endpoints = await window.api.listGenerationEndpoints()
    const restoredEndpoint = findEndpointForGeneration(endpoints, gen, stored, restoredMode)

    generationMode.value = restoredMode
    if (restoredEndpoint) {
      endpointKey.value = restoredEndpoint.endpointKey
      if (restoredEndpoint.providerId === 'local') {
        void useModelStore().setActiveModel(restoredEndpoint.providerModelId)
      }
    }

    await nextTick()

    const vals: Record<string, unknown> = { ...stored }
    delete vals.model
    delete vals.mode

    if (gen.prompt != null) vals.prompt = gen.prompt
    if (gen.width && gen.height && vals.size == null) vals.size = `${gen.width}*${gen.height}`
    if (gen.steps != null && vals.steps == null) vals.steps = gen.steps
    if (gen.guidance != null && vals.guidance == null) vals.guidance = gen.guidance
    if (gen.sampling_method != null && vals.sampling_method == null) {
      vals.sampling_method = gen.sampling_method
    }

    const restored: RefImage[] = inputs
      .slice()
      .sort((a, b) => a.position - b.position)
      .flatMap((input): RefImage[] => {
        if (input.source_type === 'library' && input.media_id) {
          return [
            {
              kind: 'id',
              id: input.media_id,
              thumbSrc: input.thumb_path,
              label: input.original_filename
            }
          ]
        }
        if (input.source_type === 'external' && input.original_path) {
          return [
            {
              kind: 'path',
              path: input.original_path,
              thumbSrc: input.thumb_path,
              label: input.original_filename
            }
          ]
        }
        return []
      })

    formValues.value = vals
    refImages.value = restored
  }

  // -- Timeline actions --
  function setGenerations(items: GenerationRecord[]): void {
    generations.value = items
  }

  function addGeneration(gen: GenerationRecord): void {
    generations.value = [gen, ...generations.value]
  }

  function updateGeneration(id: string, updates: Partial<GenerationRecord>): void {
    generations.value = generations.value.map((g) => (g.id === id ? { ...g, ...updates } : g))
  }

  function removeGeneration(id: string): void {
    generations.value = generations.value.filter((g) => g.id !== id)
  }

  function clearFailed(): void {
    generations.value = generations.value.filter((g) => g.status !== 'failed')
  }

  function setDetailGenerationId(id: string | null): void {
    detailGenerationId.value = id
  }

  async function loadTimeline(): Promise<void> {
    const { generations: items } = await window.api.timeline.getAll()
    generations.value = items
  }

  // -- Build params for submission --
  function buildParams(): GenerationSubmitInput {
    const values = { ...formValues.value }

    const refImageIds = refImages.value.filter((r) => r.kind === 'id').map((r) => r.id)
    const refImagePaths = refImages.value.filter((r) => r.kind === 'path').map((r) => r.path)
    if (refImageIds.length > 0) values.ref_image_ids = refImageIds
    if (refImagePaths.length > 0) values.ref_image_paths = refImagePaths

    return {
      endpointKey: endpointKey.value,
      mode: generationMode.value,
      params: values as GenerationSubmitInput['params']
    }
  }

  return {
    // State
    generationMode,
    formValues,
    refImages,
    endpointKey,
    generations,
    detailGenerationId,

    // Getters
    prompt,

    // Form actions
    setFormValue,
    setFormValues,
    resetFormValues,
    addRefImage,
    refImageFromMedia,
    removeRefImageAt,
    replaceRefImageAt,
    reorderRefImages,
    clearRefImages,
    setEndpointKey,
    setGenerationMode,
    reloadFromGeneration,

    // Timeline actions
    setGenerations,
    addGeneration,
    updateGeneration,
    removeGeneration,
    clearFailed,
    setDetailGenerationId,
    loadTimeline,

    // Submission
    buildParams
  }
})
