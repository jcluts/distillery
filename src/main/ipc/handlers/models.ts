import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../channels'
import type { ModelCatalogService } from '../../models/model-catalog-service'
import type { ModelDownloadManager } from '../../models/model-download-manager'
import type { AppSettings } from '../../types'
import type { ModelComponent, DownloadProgressEvent, ModelFileRef } from '../../models/types'
import { getDatabase } from '../../db/connection'
import * as settingsRepo from '../../db/repositories/settings'
import { ModelResolver } from '../../models/model-resolver'
import { bootstrapQuantSelections } from '../../models/selection-bootstrap'

interface DownloadFilePayload {
  modelId: string
  component: ModelComponent
  quantId?: string
}

interface CancelDownloadPayload {
  relativePath: string
}

interface CheckFilesPayload {
  modelId: string
}

export function registerModelHandlers(options: {
  modelCatalogService: ModelCatalogService
  modelDownloadManager: ModelDownloadManager
  onDownloadProgress?: (event: DownloadProgressEvent) => void
}): void {
  const db = getDatabase()
  const { modelCatalogService, modelDownloadManager } = options

  modelDownloadManager.on('progress', (event: DownloadProgressEvent) => {
    options.onDownloadProgress?.(event)
  })

  ipcMain.handle(IPC_CHANNELS.MODEL_GET_CATALOG, () => {
    return modelCatalogService.loadCatalog()
  })

  ipcMain.handle(IPC_CHANNELS.MODEL_GET_DOWNLOAD_STATUS, () => {
    return modelDownloadManager.getDownloadStatuses()
  })

  ipcMain.handle(IPC_CHANNELS.MODEL_DOWNLOAD_FILE, async (_event, payload: DownloadFilePayload) => {
    const catalog = modelCatalogService.loadCatalog()
    const model = catalog.models.find((entry) => entry.id === payload.modelId)
    if (!model) {
      throw new Error(`Unknown modelId: ${payload.modelId}`)
    }

    let fileRef: ModelFileRef | null = null

    if (payload.component === 'vae') {
      fileRef = model.vae
    } else if (payload.component === 'diffusion') {
      fileRef = model.diffusion.quants.find((q) => q.id === payload.quantId) ?? null
    } else if (payload.component === 'textEncoder') {
      fileRef = model.textEncoder.quants.find((q) => q.id === payload.quantId) ?? null
    }

    if (!fileRef) {
      throw new Error(
        `Unable to resolve file for model=${payload.modelId} component=${payload.component} quant=${payload.quantId ?? 'n/a'}`
      )
    }

    await modelDownloadManager.enqueueDownload({
      url: fileRef.downloadUrl,
      destRelativePath: fileRef.file,
      expectedSize: fileRef.size
    })

    const settings = settingsRepo.getAllSettings(db) as AppSettings
    const bootstrap = bootstrapQuantSelections({
      catalog,
      settings,
      modelId: payload.modelId
    })

    if (bootstrap.updated) {
      settingsRepo.saveSettings(db, {
        model_quant_selections: bootstrap.selections
      })
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.MODEL_CANCEL_DOWNLOAD,
    async (_event, payload: CancelDownloadPayload) => {
      modelDownloadManager.cancelDownload(payload.relativePath)
    }
  )

  ipcMain.handle(IPC_CHANNELS.MODEL_CHECK_FILES, async (_event, payload: CheckFilesPayload) => {
    const catalog = modelCatalogService.loadCatalog()
    const settings = settingsRepo.getAllSettings(db) as AppSettings

    const bootstrap = bootstrapQuantSelections({
      catalog,
      settings,
      modelId: payload.modelId
    })

    const effectiveSettings = bootstrap.updated
      ? {
          ...settings,
          model_quant_selections: bootstrap.selections
        }
      : settings

    if (bootstrap.updated) {
      settingsRepo.saveSettings(db, {
        model_quant_selections: bootstrap.selections
      })
    }

    const resolver = new ModelResolver(catalog, effectiveSettings)
    return resolver.getModelFileStatuses(payload.modelId)
  })
}
