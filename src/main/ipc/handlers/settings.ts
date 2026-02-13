import { ipcMain, dialog, shell } from 'electron'
import { IPC_CHANNELS } from '../channels'
import { getDatabase } from '../../db/connection'
import * as settingsRepo from '../../db/repositories/settings'
import type { EngineManager } from '../../engine/engine-manager'
import type { FileManager } from '../../files/file-manager'
import type { ModelCatalogService } from '../../models/model-catalog-service'
import type { ModelDownloadManager } from '../../models/model-download-manager'
import { ModelResolver } from '../../models/model-resolver'
import os from 'os'
import type { SettingsUpdate } from '../../types'

export function registerSettingsHandlers(options?: {
  engineManager?: EngineManager
  fileManager?: FileManager
  modelCatalogService?: ModelCatalogService
  modelDownloadManager?: ModelDownloadManager
  onLibraryRootChanged?: (nextRoot: string) => void
}): void {
  const db = getDatabase()

  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, () => {
    return settingsRepo.getAllSettings(db)
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS_SAVE, async (_event, updates: SettingsUpdate) => {
    settingsRepo.saveSettings(db, updates)

    const engineManager = options?.engineManager
    const fileManager = options?.fileManager
    const modelCatalogService = options?.modelCatalogService
    const modelDownloadManager = options?.modelDownloadManager

    if (fileManager && typeof updates.library_root === 'string') {
      fileManager.setLibraryRoot(updates.library_root)
      options?.onLibraryRootChanged?.(updates.library_root)
    }

    if (modelDownloadManager && typeof updates.model_base_path === 'string') {
      modelDownloadManager.setModelBasePath(updates.model_base_path)
    }

    if (engineManager && typeof updates.engine_path === 'string') {
      engineManager.setEnginePath(updates.engine_path)

      const status = engineManager.getStatus()
      if ((status.state === 'stopped' || status.state === 'error') && updates.engine_path) {
        try {
          await engineManager.start()
        } catch (err) {
          console.error('[Settings] Failed to start engine after engine_path update:', err)
        }
      }
    }

    if (engineManager) {
      const all = settingsRepo.getAllSettings(db)
      const status = engineManager.getStatus()

      const canLoad = status.state === 'idle' || status.state === 'ready'

      if (canLoad && modelCatalogService) {
        try {
          const resolver = new ModelResolver(modelCatalogService.loadCatalog(), all)
          if (!resolver.isModelReady(all.active_model_id)) {
            return
          }

          const paths = resolver.getActiveModelPaths()
          await engineManager.loadModel({
            ...paths,
            offload_to_cpu: all.offload_to_cpu,
            flash_attn: all.flash_attn,
            vae_on_cpu: all.vae_on_cpu,
            llm_on_cpu: all.llm_on_cpu
          })
        } catch (err) {
          console.error('[Settings] Model load failed after settings update:', err)
        }
      }
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.APP_SHOW_OPEN_DIALOG,
    async (_event, options: Electron.OpenDialogOptions) => {
      const result = await dialog.showOpenDialog(options)
      return result.canceled ? null : result.filePaths
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.APP_SHOW_SAVE_DIALOG,
    async (_event, options: Electron.SaveDialogOptions) => {
      const result = await dialog.showSaveDialog(options)
      return result.canceled ? null : result.filePath
    }
  )

  ipcMain.handle(IPC_CHANNELS.APP_SHOW_ITEM_IN_FOLDER, (_event, path: string) => {
    shell.showItemInFolder(path)
  })

  ipcMain.handle(IPC_CHANNELS.APP_GET_HARDWARE_PROFILE, () => {
    return {
      platform: process.platform,
      arch: process.arch,
      totalMemory: os.totalmem()
    }
  })
}
