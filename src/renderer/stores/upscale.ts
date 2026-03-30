import { defineStore } from 'pinia'
import { ref } from 'vue'

import { useLibraryStore } from '@/stores/library'
import type {
  UpscaleModelInfo,
  UpscaleVariant,
  UpscaleProgressEvent,
  UpscaleResultEvent
} from '@/types'

export const useUpscaleStore = defineStore('upscale', () => {
  const models = ref<UpscaleModelInfo[]>([])
  const variants = ref<UpscaleVariant[]>([])
  const activeVariantId = ref<string | null>(null)
  const selectedModelId = ref<string | null>(null)
  const selectedScale = ref(4)
  const isUpscaling = ref(false)
  const progressPhase = ref<string | null>(null)
  const progressMessage = ref<string | null>(null)
  const progressStep = ref<number | null>(null)
  const progressTotalSteps = ref<number | null>(null)
  const lastUpscaleTimeMs = ref<number | null>(null)

  async function loadModels(): Promise<void> {
    try {
      const allModels = await window.api.upscale.getModels()
      const available = allModels.filter((m) => m.available)
      const nextSelected = available.some((m) => m.id === selectedModelId.value)
        ? selectedModelId.value
        : (available[0]?.id ?? null)

      models.value = available
      selectedModelId.value = nextSelected
    } catch {
      // ignore
    }
  }

  async function loadUpscaleData(mediaId: string): Promise<void> {
    try {
      const data = await window.api.upscale.getData(mediaId)
      variants.value = data.variants
      activeVariantId.value = data.activeVariantId
      lastUpscaleTimeMs.value = null
    } catch {
      // ignore
    }
  }

  function clearUpscaleData(): void {
    variants.value = []
    activeVariantId.value = null
    lastUpscaleTimeMs.value = null
  }

  async function submit(mediaId: string): Promise<void> {
    if (!selectedModelId.value) return

    isUpscaling.value = true
    progressPhase.value = 'preparing'
    progressMessage.value = null
    progressStep.value = null
    progressTotalSteps.value = null
    lastUpscaleTimeMs.value = null

    try {
      await window.api.upscale.submit({
        mediaId,
        modelId: selectedModelId.value,
        scaleFactor: selectedScale.value
      })
    } catch {
      isUpscaling.value = false
      progressPhase.value = null
    }
  }

  async function setActive(mediaId: string, variantId: string | null): Promise<void> {
    try {
      await window.api.upscale.setActive(mediaId, variantId)
      activeVariantId.value = variantId
      const updated = await window.api.getMediaById(mediaId)
      if (updated) {
        useLibraryStore().updateLocalItem(mediaId, {
          active_upscale_id: updated.active_upscale_id,
          working_file_path: updated.working_file_path ?? null
        })
      }
    } catch {
      // ignore
    }
  }

  async function deleteVariant(variantId: string, mediaId: string): Promise<void> {
    try {
      await window.api.upscale.deleteVariant(variantId)
      await loadUpscaleData(mediaId)
      const updated = await window.api.getMediaById(mediaId)
      if (updated) {
        useLibraryStore().updateLocalItem(mediaId, {
          active_upscale_id: updated.active_upscale_id,
          working_file_path: updated.working_file_path ?? null
        })
      }
    } catch {
      // ignore
    }
  }

  async function deleteAll(mediaId: string): Promise<void> {
    try {
      await window.api.upscale.deleteAll(mediaId)
      variants.value = []
      activeVariantId.value = null
      useLibraryStore().updateLocalItem(mediaId, {
        active_upscale_id: null,
        working_file_path: null
      })
    } catch {
      // ignore
    }
  }

  function setSelectedModelId(id: string): void {
    selectedModelId.value = id
  }

  function setSelectedScale(scale: number): void {
    selectedScale.value = scale
  }

  function handleProgress(event: UpscaleProgressEvent): void {
    if (event.phase === 'complete') {
      isUpscaling.value = false
      progressPhase.value = null
      progressMessage.value = null
      progressStep.value = null
      progressTotalSteps.value = null
    } else if (event.phase === 'error') {
      isUpscaling.value = false
      progressPhase.value = 'error'
      progressMessage.value = event.message ?? null
      progressStep.value = null
      progressTotalSteps.value = null
    } else {
      isUpscaling.value = true
      progressPhase.value = event.phase
      progressMessage.value = event.message ?? null
      progressStep.value = event.step ?? null
      progressTotalSteps.value = event.totalSteps ?? null
    }
  }

  function handleResult(event: UpscaleResultEvent): void {
    isUpscaling.value = false
    progressStep.value = null
    progressTotalSteps.value = null

    if (event.success && event.variant) {
      progressPhase.value = null
      progressMessage.value = null
      lastUpscaleTimeMs.value = event.totalTimeMs ?? null
      variants.value = [event.variant, ...variants.value]
      activeVariantId.value = event.variant.id
    } else {
      progressPhase.value = 'error'
      progressMessage.value = event.error ?? null
      lastUpscaleTimeMs.value = null
    }
  }

  return {
    models,
    variants,
    activeVariantId,
    selectedModelId,
    selectedScale,
    isUpscaling,
    progressPhase,
    progressMessage,
    progressStep,
    progressTotalSteps,
    lastUpscaleTimeMs,
    loadModels,
    loadUpscaleData,
    clearUpscaleData,
    submit,
    setActive,
    deleteVariant,
    deleteAll,
    setSelectedModelId,
    setSelectedScale,
    handleProgress,
    handleResult
  }
})
