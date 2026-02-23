import { ipcMain } from 'electron'

import { getDatabase } from '../../db/connection'
import { IPC_CHANNELS } from '../channels'
import type { FileManager } from '../../files/file-manager'
import type { ImportFolderCreate, ImportFolderUpdate, ImportScanProgress } from '../../types'
import * as importFoldersRepo from '../../db/repositories/import-folders'
import * as importFolderService from '../../import/import-folder-service'

export function registerImportFolderHandlers(
  fileManager: FileManager,
  options?: {
    onImportFoldersUpdated?: () => void
    onLibraryUpdated?: () => void
    onScanProgress?: (progress: ImportScanProgress) => void
  }
): void {
  const db = getDatabase()

  ipcMain.handle(IPC_CHANNELS.IMPORT_FOLDERS_GET_ALL, () => {
    return importFoldersRepo.getAllImportFolders(db)
  })

  ipcMain.handle(IPC_CHANNELS.IMPORT_FOLDERS_CREATE, (_event, data: ImportFolderCreate) => {
    const created = importFoldersRepo.createImportFolder(db, data)
    options?.onImportFoldersUpdated?.()
    return created
  })

  ipcMain.handle(IPC_CHANNELS.IMPORT_FOLDERS_UPDATE, (_event, data: ImportFolderUpdate) => {
    const updated = importFoldersRepo.updateImportFolder(db, data)
    options?.onImportFoldersUpdated?.()
    return updated
  })

  ipcMain.handle(IPC_CHANNELS.IMPORT_FOLDERS_DELETE, (_event, id: string) => {
    importFoldersRepo.deleteImportFolder(db, id)
    options?.onImportFoldersUpdated?.()
  })

  ipcMain.handle(IPC_CHANNELS.IMPORT_FOLDERS_SCAN, async (_event, id: string) => {
    const folder = importFoldersRepo.getImportFolderById(db, id)
    if (!folder) {
      throw new Error(`Import folder not found: ${id}`)
    }

    const progress = await importFolderService.scanImportFolder(
      db,
      fileManager,
      folder,
      (event) => {
        options?.onScanProgress?.(event)
      }
    )

    options?.onImportFoldersUpdated?.()
    options?.onLibraryUpdated?.()

    return progress
  })

  ipcMain.handle(IPC_CHANNELS.IMPORT_FOLDERS_START, async (_event, data: ImportFolderCreate) => {
    const progress = await importFolderService.startImport(db, fileManager, data, (event) => {
      options?.onScanProgress?.(event)
    })

    options?.onImportFoldersUpdated?.()
    options?.onLibraryUpdated?.()

    return progress
  })
}
