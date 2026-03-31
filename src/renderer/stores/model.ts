import { defineStore } from 'pinia'
import { ref } from 'vue'

import type {
  AppSettings,
  DownloadProgressEvent,
  ModelCatalog,
  ModelComponent,
  ModelFilesCheckResult
} from '@/types'

function normalizeRelativePath(p: string): string {
  return p.replace(/\\+/g, '/')
}

function cloneSettings(settings: AppSettings): AppSettings {
  return {
    ...settings,
    model_quant_selections: JSON.parse(JSON.stringify(settings.model_quant_selections ?? {}))
  }
}

export const useModelStore = defineStore('model', () => {
  const catalog = ref<ModelCatalog | null>(null)
  const settings = ref<AppSettings | null>(null)
  const downloadStatusByPath = ref<Record<string, DownloadProgressEvent>>({})
  const filesByModelId = ref<Record<string, ModelFilesCheckResult>>({})
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function hydrate(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const [cat, sett, rawDl] = await Promise.all([
        window.api.getModelCatalog(),
        window.api.getSettings(),
        window.api.getModelDownloadStatus()
      ])
      catalog.value = cat
      settings.value = sett
      downloadStatusByPath.value = Object.fromEntries(
        Object.entries(rawDl).map(([k, v]) => [
          normalizeRelativePath(k),
          { ...v, relativePath: normalizeRelativePath(v.relativePath) }
        ])
      )
      await refreshAllModelFiles()
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loading.value = false
    }
  }

  async function refreshSettings(): Promise<void> {
    settings.value = await window.api.getSettings()
  }

  async function refreshModelFiles(modelId: string): Promise<void> {
    const result = await window.api.checkModelFiles({ modelId })
    filesByModelId.value = { ...filesByModelId.value, [modelId]: result }
    await refreshSettings()
  }

  async function refreshAllModelFiles(): Promise<void> {
    if (!catalog.value) return
    const checks = await Promise.all(
      catalog.value.models.map((m) => window.api.checkModelFiles({ modelId: m.id }))
    )
    const next: Record<string, ModelFilesCheckResult> = {}
    for (const check of checks) next[check.modelId] = check
    filesByModelId.value = next
    await refreshSettings()
  }

  async function reconcileDownloadStatuses(): Promise<void> {
    const rawStatuses = await window.api.getModelDownloadStatus()
    const fresh = Object.fromEntries(
      Object.entries(rawStatuses).map(([k, v]) => [
        normalizeRelativePath(k),
        { ...v, relativePath: normalizeRelativePath(v.relativePath) }
      ])
    )

    const existingPaths = new Set<string>()
    for (const check of Object.values(filesByModelId.value)) {
      for (const file of check.files) {
        if (file.exists) existingPaths.add(normalizeRelativePath(file.relativePath))
      }
    }

    const reconciled = { ...fresh }
    for (const [relPath, status] of Object.entries(reconciled)) {
      if (existingPaths.has(relPath) && (status.status === 'downloading' || status.status === 'queued')) {
        reconciled[relPath] = { ...status, status: 'completed', downloadedBytes: status.totalBytes }
      }
    }

    downloadStatusByPath.value = reconciled
    await refreshAllModelFiles()
  }

  function setDownloadProgress(event: DownloadProgressEvent): void {
    const normalized = { ...event, relativePath: normalizeRelativePath(event.relativePath) }
    downloadStatusByPath.value = { ...downloadStatusByPath.value, [normalized.relativePath]: normalized }

    if (!catalog.value) return
    for (const model of catalog.value.models) {
      const matchesVae = normalizeRelativePath(model.vae.file) === normalized.relativePath
      const matchesDiff = model.diffusion.quants.some(
        (q) => normalizeRelativePath(q.file) === normalized.relativePath
      )
      const matchesTE = model.textEncoder.quants.some(
        (q) => normalizeRelativePath(q.file) === normalized.relativePath
      )
      if (matchesVae || matchesDiff || matchesTE) void refreshModelFiles(model.id)
    }
  }

  async function setActiveModel(modelId: string): Promise<void> {
    const current = settings.value ?? (await window.api.getSettings())
    const next = cloneSettings(current)
    next.active_model_id = modelId
    await window.api.saveSettings({ active_model_id: modelId })
    settings.value = next
    await refreshModelFiles(modelId)
  }

  async function setModelQuantSelection(
    modelId: string,
    component: Exclude<ModelComponent, 'vae'>,
    quantId: string
  ): Promise<void> {
    const current = settings.value ?? (await window.api.getSettings())
    const next = cloneSettings(current)
    const existing = next.model_quant_selections?.[modelId] ?? {
      diffusionQuant: '',
      textEncoderQuant: ''
    }
    if (component === 'diffusion') existing.diffusionQuant = quantId
    else existing.textEncoderQuant = quantId

    next.model_quant_selections = { ...(next.model_quant_selections ?? {}), [modelId]: existing }
    await window.api.saveSettings({ model_quant_selections: next.model_quant_selections })
    settings.value = next
    await refreshModelFiles(modelId)
  }

  async function downloadModelFile(payload: {
    modelId: string
    component: ModelComponent
    quantId?: string
  }): Promise<void> {
    try {
      await window.api.downloadModelFile(payload)
      await refreshModelFiles(payload.modelId)
      error.value = null
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    }
  }

  async function cancelModelDownload(relativePath: string): Promise<void> {
    await window.api.cancelModelDownload({ relativePath })
  }

  async function removeModelFile(payload: { modelId: string; relativePath: string }): Promise<void> {
    try {
      await window.api.removeModelFile({ relativePath: payload.relativePath })
      const normalized = normalizeRelativePath(payload.relativePath)
      const next = { ...downloadStatusByPath.value }
      delete next[normalized]
      downloadStatusByPath.value = next
      error.value = null
      await refreshModelFiles(payload.modelId)
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    }
  }

  return {
    catalog,
    settings,
    downloadStatusByPath,
    filesByModelId,
    loading,
    error,

    hydrate,
    refreshSettings,
    refreshModelFiles,
    refreshAllModelFiles,
    reconcileDownloadStatuses,
    setDownloadProgress,
    setActiveModel,
    setModelQuantSelection,
    downloadModelFile,
    cancelModelDownload,
    removeModelFile
  }
})
