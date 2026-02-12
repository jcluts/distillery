import { ipcMain, dialog, shell } from 'electron'
import { IPC_CHANNELS } from '../channels'
import { getDatabase } from '../../db/connection'
import * as settingsRepo from '../../db/repositories/settings'
import os from 'os'
import type { SettingsUpdate } from '../../types'

export function registerSettingsHandlers(): void {
  const db = getDatabase()

  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, () => {
    return settingsRepo.getAllSettings(db)
  })

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_SAVE,
    (_event, updates: SettingsUpdate) => {
      settingsRepo.saveSettings(db, updates)
    }
  )

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
