import { create } from 'zustand'
import type {
  AppSettings,
  DownloadProgressEvent,
  ModelCatalog,
  ModelComponent,
  ModelFilesCheckResult
} from '@/types'

interface ModelStoreState {
  catalog: ModelCatalog | null
  settings: AppSettings | null
  downloadStatusByPath: Record<string, DownloadProgressEvent>
  filesByModelId: Record<string, ModelFilesCheckResult>
  loading: boolean
  error: string | null

  hydrate: () => Promise<void>
  refreshSettings: () => Promise<void>
  refreshModelFiles: (modelId: string) => Promise<void>
  refreshAllModelFiles: () => Promise<void>
  setDownloadProgress: (event: DownloadProgressEvent) => void
  reconcileDownloadStatuses: () => Promise<void>
  setActiveModel: (modelId: string) => Promise<void>
  setModelQuantSelection: (
    modelId: string,
    component: Exclude<ModelComponent, 'vae'>,
    quantId: string
  ) => Promise<void>
  downloadModelFile: (payload: {
    modelId: string
    component: ModelComponent
    quantId?: string
  }) => Promise<void>
  cancelModelDownload: (relativePath: string) => Promise<void>
  removeModelFile: (payload: { modelId: string; relativePath: string }) => Promise<void>
}

function normalizeRelativePath(relativePath: string): string {
  return relativePath.replace(/\\+/g, '/')
}

function cloneSettings(settings: AppSettings): AppSettings {
  return {
    ...settings,
    model_quant_selections: JSON.parse(JSON.stringify(settings.model_quant_selections ?? {}))
  }
}

export const useModelStore = create<ModelStoreState>((set, get) => ({
  catalog: null,
  settings: null,
  downloadStatusByPath: {},
  filesByModelId: {},
  loading: false,
  error: null,

  hydrate: async () => {
    set({ loading: true, error: null })

    try {
      const [catalog, settings, rawDownloadStatusByPath] = await Promise.all([
        window.api.getModelCatalog(),
        window.api.getSettings(),
        window.api.getModelDownloadStatus()
      ])

      const downloadStatusByPath = Object.fromEntries(
        Object.entries(rawDownloadStatusByPath).map(([key, value]) => [
          normalizeRelativePath(key),
          {
            ...value,
            relativePath: normalizeRelativePath(value.relativePath)
          }
        ])
      )

      set({
        catalog,
        settings,
        downloadStatusByPath,
        error: null
      })

      await get().refreshAllModelFiles()
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error)
      })
    } finally {
      set({ loading: false })
    }
  },

  refreshSettings: async () => {
    const settings = await window.api.getSettings()
    set({ settings })
  },

  refreshModelFiles: async (modelId: string) => {
    const result = await window.api.checkModelFiles({ modelId })
    set((state) => ({
      filesByModelId: {
        ...state.filesByModelId,
        [modelId]: result
      }
    }))

    await get().refreshSettings()
  },

  refreshAllModelFiles: async () => {
    const catalog = get().catalog
    if (!catalog) return

    const checks = await Promise.all(
      catalog.models.map((model) => window.api.checkModelFiles({ modelId: model.id }))
    )

    const next: Record<string, ModelFilesCheckResult> = {}
    for (const check of checks) {
      next[check.modelId] = check
    }

    set({ filesByModelId: next })

    await get().refreshSettings()
  },

  reconcileDownloadStatuses: async () => {
    // Re-fetch authoritative download statuses from the main process and disk state.
    // This corrects any stale renderer state caused by missed IPC events
    // (e.g. when the window was unfocused and Chromium throttled the renderer).
    const rawStatuses = await window.api.getModelDownloadStatus()
    const freshStatuses = Object.fromEntries(
      Object.entries(rawStatuses).map(([key, value]) => [
        normalizeRelativePath(key),
        { ...value, relativePath: normalizeRelativePath(value.relativePath) }
      ])
    )

    // Also reconcile against actual files on disk: if a file exists,
    // any non-completed download status is stale and should be overridden.
    const filesByModelId = get().filesByModelId
    const existingPaths = new Set<string>()
    for (const check of Object.values(filesByModelId)) {
      for (const file of check.files) {
        if (file.exists) {
          existingPaths.add(normalizeRelativePath(file.relativePath))
        }
      }
    }

    const reconciled = { ...freshStatuses }
    for (const [relPath, status] of Object.entries(reconciled)) {
      if (
        existingPaths.has(relPath) &&
        (status.status === 'downloading' || status.status === 'queued')
      ) {
        reconciled[relPath] = {
          ...status,
          status: 'completed',
          downloadedBytes: status.totalBytes
        }
      }
    }

    set({ downloadStatusByPath: reconciled })

    // Refresh file presence from disk as well
    await get().refreshAllModelFiles()
  },

  setDownloadProgress: (event) => {
    const normalizedEvent = {
      ...event,
      relativePath: normalizeRelativePath(event.relativePath)
    }
    const catalog = get().catalog

    set((state) => ({
      downloadStatusByPath: {
        ...state.downloadStatusByPath,
        [normalizedEvent.relativePath]: normalizedEvent
      }
    }))

    if (!catalog) return

    const impactedModels = catalog.models
      .filter((model) => {
        if (normalizeRelativePath(model.vae.file) === normalizedEvent.relativePath) return true
        if (
          model.diffusion.quants.some(
            (q) => normalizeRelativePath(q.file) === normalizedEvent.relativePath
          )
        ) {
          return true
        }
        if (
          model.textEncoder.quants.some(
            (q) => normalizeRelativePath(q.file) === normalizedEvent.relativePath
          )
        ) {
          return true
        }
        return false
      })
      .map((model) => model.id)

    for (const modelId of impactedModels) {
      void get().refreshModelFiles(modelId)
    }
  },

  setActiveModel: async (modelId) => {
    const currentSettings = get().settings ?? (await window.api.getSettings())
    const next = cloneSettings(currentSettings)
    next.active_model_id = modelId

    await window.api.saveSettings({ active_model_id: modelId })

    set({ settings: next })
    await get().refreshModelFiles(modelId)
  },

  setModelQuantSelection: async (modelId, component, quantId) => {
    const currentSettings = get().settings ?? (await window.api.getSettings())
    const next = cloneSettings(currentSettings)
    const existing = next.model_quant_selections?.[modelId] ?? {
      diffusionQuant: '',
      textEncoderQuant: ''
    }

    if (component === 'diffusion') {
      existing.diffusionQuant = quantId
    } else {
      existing.textEncoderQuant = quantId
    }

    next.model_quant_selections = {
      ...(next.model_quant_selections ?? {}),
      [modelId]: existing
    }

    await window.api.saveSettings({ model_quant_selections: next.model_quant_selections })

    set({ settings: next })
    await get().refreshModelFiles(modelId)
  },

  downloadModelFile: async (payload) => {
    try {
      await window.api.downloadModelFile(payload)
      await get().refreshModelFiles(payload.modelId)
      set({ error: null })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
    }
  },

  cancelModelDownload: async (relativePath) => {
    await window.api.cancelModelDownload({ relativePath })
  },

  removeModelFile: async ({ modelId, relativePath }) => {
    try {
      await window.api.removeModelFile({ relativePath })

      const normalizedPath = normalizeRelativePath(relativePath)
      set((state) => {
        const nextStatusByPath = { ...state.downloadStatusByPath }
        delete nextStatusByPath[normalizedPath]
        return { downloadStatusByPath: nextStatusByPath, error: null }
      })

      await get().refreshModelFiles(modelId)
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
    }
  }
}))
