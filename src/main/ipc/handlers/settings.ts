import { ipcMain, dialog, shell } from 'electron'
import { IPC_CHANNELS } from '../channels'
import { getDatabase } from '../../db/connection'
import * as settingsRepo from '../../db/repositories/settings'
import type { EngineManager } from '../../engine/engine-manager'
import type { FileManager } from '../../files/file-manager'
import type { ModelDownloadManager } from '../../models/model-download-manager'
import os from 'os'
import type { SettingsUpdate } from '../../types'

export function registerSettingsHandlers(options?: {
  engineManager?: EngineManager
  fileManager?: FileManager
  modelDownloadManager?: ModelDownloadManager
  onLibraryRootChanged?: (nextRoot: string) => void
}): void {
  const db = getDatabase()

  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, () => {
    return settingsRepo.getAllSettings(db)
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS_SAVE, async (_event, updates: SettingsUpdate) => {
    settingsRepo.saveSettings(db, updates)
    const effectiveSettings = settingsRepo.getAllSettings(db)

    const engineManager = options?.engineManager
    const fileManager = options?.fileManager
    const modelDownloadManager = options?.modelDownloadManager

    if (fileManager && typeof updates.library_root === 'string') {
      fileManager.setLibraryRoot(updates.library_root)
      options?.onLibraryRootChanged?.(updates.library_root)
    }

    if (modelDownloadManager && typeof updates.model_base_path === 'string') {
      modelDownloadManager.setModelBasePath(effectiveSettings.model_base_path)
    }

    if (engineManager && typeof updates.engine_path === 'string') {
      engineManager.setEnginePath(effectiveSettings.engine_path)

      const status = engineManager.getStatus()
      if (
        (status.state === 'stopped' || status.state === 'error') &&
        effectiveSettings.engine_path
      ) {
        try {
          await engineManager.start()
        } catch (err) {
          console.error('[Settings] Failed to start engine after engine_path update:', err)
        }
      }
    }

    // When model-affecting settings change, unload the current model so the
    // next generation lazy-loads the correct one.
    if (engineManager) {
      const modelSettingsChanged =
        updates.active_model_id !== undefined || updates.model_quant_selections !== undefined

      if (modelSettingsChanged && engineManager.getStatus().state === 'ready') {
        try {
          await engineManager.unloadModel()
          console.log('[Settings] Model unloaded after model/quant change')
        } catch (err) {
          console.error('[Settings] Failed to unload model:', err)
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
