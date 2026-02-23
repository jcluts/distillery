import Database from 'better-sqlite3'
import * as fs from 'fs'
import * as path from 'path'

import { FileManager } from '../files/file-manager'
import { isVideoExtension } from '../files/video-derivatives'
import type { ImportFolderCreate, ImportFolderRecord, ImportScanProgress } from '../types'
import * as importFoldersRepo from '../db/repositories/import-folders'
import * as mediaRepo from '../db/repositories/media'
import { importSingleFile } from './import-file'

const SUPPORTED_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.bmp',
  '.tif',
  '.tiff',
  '.mp4',
  '.webm',
  '.mov'
])

function isSupportedMediaFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase()
  return SUPPORTED_EXTENSIONS.has(ext) || isVideoExtension(ext)
}

function listImportableFiles(rootPath: string, recursive: boolean): string[] {
  const discovered: string[] = []

  const walk = (currentPath: string): void => {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name)

      if (entry.isDirectory()) {
        if (!recursive || entry.name.startsWith('.')) {
          continue
        }
        walk(fullPath)
        continue
      }

      if (!entry.isFile()) {
        continue
      }

      if (isSupportedMediaFile(fullPath)) {
        discovered.push(fullPath)
      }
    }
  }

  walk(rootPath)
  return discovered
}

function cleanupEmptyDirectories(folderPath: string): number {
  const removeEmpty = (currentPath: string): number => {
    let deleted = 0

    const entries = fs.readdirSync(currentPath, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) {
        continue
      }

      deleted += removeEmpty(path.join(currentPath, entry.name))
    }

    if (currentPath === folderPath) {
      return deleted
    }

    if (fs.readdirSync(currentPath).length === 0) {
      fs.rmdirSync(currentPath)
      return deleted + 1
    }

    return deleted
  }

  if (!fs.existsSync(folderPath)) {
    return 0
  }

  try {
    return removeEmpty(folderPath)
  } catch (error) {
    console.warn('[ImportFolder] Failed to clean empty directories:', error)
    return 0
  }
}

function emitProgress(
  progress: ImportScanProgress,
  onProgress: (progress: ImportScanProgress) => void
): void {
  onProgress({ ...progress })
}

export async function scanImportFolder(
  db: Database.Database,
  fileManager: FileManager,
  config: ImportFolderRecord,
  onProgress: (progress: ImportScanProgress) => void
): Promise<ImportScanProgress> {
  const progress: ImportScanProgress = {
    folder_id: config.id,
    folder_name: config.name,
    files_found: 0,
    files_processed: 0,
    files_imported: 0,
    files_skipped: 0,
    files_errored: 0,
    status: 'scanning'
  }

  emitProgress(progress, onProgress)

  const folderPath = config.path
  if (!folderPath || !fs.existsSync(folderPath)) {
    progress.status = 'error'
    progress.error = `Import folder does not exist: ${folderPath}`
    emitProgress(progress, onProgress)
    return progress
  }

  try {
    const files = listImportableFiles(folderPath, config.recursive)
    progress.files_found = files.length
    progress.status = 'importing'
    emitProgress(progress, onProgress)

    for (const filePath of files) {
      try {
        if (config.import_mode === 'reference') {
          const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(filePath)
          if (mediaRepo.getMediaByFilePath(db, absolutePath)) {
            progress.files_skipped += 1
            progress.files_processed += 1
            emitProgress(progress, onProgress)
            continue
          }
        }

        const imported = await importSingleFile(fileManager, db, filePath, {
          mode: config.import_mode,
          keywords: config.initial_keywords,
          collectionId: config.target_collection_id
        })

        if (imported) {
          progress.files_imported += 1
        } else {
          progress.files_errored += 1
        }
      } catch (error) {
        console.error('[ImportFolder] Failed while importing file:', filePath, error)
        progress.files_errored += 1
      }

      progress.files_processed += 1
      emitProgress(progress, onProgress)
    }

    if (config.import_mode === 'move') {
      cleanupEmptyDirectories(folderPath)
    }

    if (config.persist) {
      importFoldersRepo.updateLastScanned(db, config.id)
      const refreshed = importFoldersRepo.getImportFolderById(db, config.id)
      if (refreshed?.last_scanned) {
        progress.folder_name = refreshed.name
      }
    }

    progress.status = 'complete'
    emitProgress(progress, onProgress)
    return progress
  } catch (error) {
    progress.status = 'error'
    progress.error = error instanceof Error ? error.message : String(error)
    emitProgress(progress, onProgress)
    return progress
  }
}

export async function startImport(
  db: Database.Database,
  fileManager: FileManager,
  config: ImportFolderCreate,
  onProgress: (progress: ImportScanProgress) => void
): Promise<ImportScanProgress> {
  const record: ImportFolderRecord = config.persist
    ? importFoldersRepo.createImportFolder(db, config)
    : {
        id: 'one-time',
        name: config.name,
        path: config.path,
        import_mode: config.import_mode,
        recursive: config.recursive,
        persist: false,
        auto_import: false,
        target_collection_id: config.target_collection_id,
        initial_keywords: config.initial_keywords,
        created_at: new Date().toISOString()
      }

  return scanImportFolder(db, fileManager, record, onProgress)
}

export async function initializeAutoImportFolders(
  db: Database.Database,
  fileManager: FileManager,
  onProgress: (progress: ImportScanProgress) => void
): Promise<void> {
  const folders = importFoldersRepo.getAllImportFolders(db).filter((folder) => folder.auto_import)

  for (const folder of folders) {
    try {
      await scanImportFolder(db, fileManager, folder, onProgress)
    } catch (error) {
      onProgress({
        folder_id: folder.id,
        folder_name: folder.name,
        files_found: 0,
        files_processed: 0,
        files_imported: 0,
        files_skipped: 0,
        files_errored: 0,
        status: 'error',
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }
}
