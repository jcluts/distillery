import { ipcMain, dialog, shell } from 'electron'
import { IPC_CHANNELS } from '../channels'
import { getDatabase } from '../../db/connection'
import * as settingsRepo from '../../db/repositories/settings'
import type { EngineManager } from '../../engine/engine-manager'
import type { FileManager } from '../../files/file-manager'
import type { ModelDownloadManager } from '../../models/model-download-manager'
import type { SdCppServerManager } from '../../generation/providers/sd-cpp-server-manager'
import os from 'os'
import type { SettingsUpdate } from '../../types'

export function registerSettingsHandlers(options?: {
  engineManager?: EngineManager
  fileManager?: FileManager
  modelDownloadManager?: ModelDownloadManager
  sdCppServerManager?: SdCppServerManager
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
    const sdCppServerManager = options?.sdCppServerManager

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

      if (
        updates.local_generation_backend === 'stable-diffusion.cpp' &&
        engineManager.getStatus().state === 'ready'
      ) {
        try {
          await engineManager.unloadModel()
          console.log('[Settings] cn-engine model unloaded after switching local backend')
        } catch (err) {
          console.error('[Settings] Failed to unload cn-engine model:', err)
        }
      }
    }

    if (sdCppServerManager) {
      const sdCppSettingsChanged =
        updates.local_generation_backend !== undefined ||
        updates.sd_cpp_server_path !== undefined ||
        updates.active_model_id !== undefined ||
        updates.model_quant_selections !== undefined ||
        updates.offload_to_cpu !== undefined ||
        updates.flash_attn !== undefined ||
        updates.vae_on_cpu !== undefined ||
        updates.llm_on_cpu !== undefined

      if (sdCppSettingsChanged) {
        try {
          await sdCppServerManager.stop()
          console.log(
            '[Settings] stable-diffusion.cpp server stopped after backend settings change'
          )
        } catch (err) {
          console.error('[Settings] Failed to stop stable-diffusion.cpp server:', err)
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
