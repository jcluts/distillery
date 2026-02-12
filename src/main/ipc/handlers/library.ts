import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../channels'
import { getDatabase } from '../../db/connection'
import * as mediaRepo from '../../db/repositories/media'
import type { MediaQuery, MediaRecord, MediaUpdate } from '../../types'
import { FileManager } from '../../files/file-manager'
import { v4 as uuidv4 } from 'uuid'
import * as path from 'path'
import * as fs from 'fs'
import sharp from 'sharp'
import { generateThumbnail } from '../../files/thumbnail-service'

function toLibraryUrl(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '')
  const encoded = normalized
    .split('/')
    .filter(Boolean)
    .map((seg) => encodeURIComponent(seg))
    .join('/')
  return `distillery://library/${encoded}`
}

function mapMediaPaths(record: MediaRecord): MediaRecord {
  return {
    ...record,
    file_path: toLibraryUrl(record.file_path),
    thumb_path: record.thumb_path ? toLibraryUrl(record.thumb_path) : null
  }
}

export function registerLibraryHandlers(fileManager: FileManager, onLibraryUpdated?: () => void): void {
  const db = getDatabase()

  ipcMain.handle(IPC_CHANNELS.LIBRARY_GET_MEDIA, (_event, params: MediaQuery) => {
    const page = mediaRepo.queryMedia(db, params)
    return {
      ...page,
      items: page.items.map((m) => mapMediaPaths(m))
    }
  })

  ipcMain.handle(IPC_CHANNELS.LIBRARY_GET_MEDIA_BY_ID, (_event, id: string) => {
    const record = mediaRepo.getMediaById(db, id)
    return record ? mapMediaPaths(record) : null
  })

  ipcMain.handle(
    IPC_CHANNELS.LIBRARY_UPDATE_MEDIA,
    (_event, id: string, updates: MediaUpdate) => {
      mediaRepo.updateMedia(db, id, updates)
      onLibraryUpdated?.()
    }
  )

  ipcMain.handle(IPC_CHANNELS.LIBRARY_DELETE_MEDIA, (_event, ids: string[]) => {
    mediaRepo.deleteMedia(db, ids)
    onLibraryUpdated?.()
  })

  ipcMain.handle(IPC_CHANNELS.LIBRARY_IMPORT_MEDIA, async (_event, filePaths: string[]) => {
    const now = new Date().toISOString()
    const imported: MediaRecord[] = []

    for (const src of filePaths) {
      try {
        const id = uuidv4()
        const ext = path.extname(src) || '.png'

        const relDir = fileManager.getDateSubdir()
        const absDir = fileManager.resolve(relDir)
        await fs.promises.mkdir(absDir, { recursive: true })

        const relFilePath = path.join(relDir, `${id}${ext}`)
        const absFilePath = fileManager.resolve(relFilePath)

        await fs.promises.copyFile(src, absFilePath)

        const stat = await fs.promises.stat(absFilePath)
        const meta = await sharp(absFilePath).metadata()
        const width = meta.width ?? null
        const height = meta.height ?? null

        const thumbAbs = await generateThumbnail(absFilePath, fileManager.getThumbnailsDir(), id)
        const relThumbPath = thumbAbs ? path.join('thumbnails', `${id}_thumb.jpg`) : null

        const record: MediaRecord = {
          id,
          file_path: relFilePath,
          thumb_path: relThumbPath,
          file_name: path.basename(relFilePath),
          media_type: 'image',
          origin: 'import',
          width,
          height,
          file_size: stat.size,
          rating: 0,
          status: null,
          keywords: null,
          generation_id: null,
          origin_id: null,
          created_at: now,
          updated_at: now
        }

        mediaRepo.insertMedia(db, record)
        imported.push(record)
      } catch (err) {
        console.error('[Library] Import failed:', err)
      }
    }

    if (imported.length > 0) onLibraryUpdated?.()

    return imported.map((m) => mapMediaPaths(m))
  })

  ipcMain.handle(IPC_CHANNELS.LIBRARY_GET_THUMBNAIL, (_event, id: string) => {
    const media = mediaRepo.getMediaById(db, id)
    return media?.thumb_path ? toLibraryUrl(media.thumb_path) : null
  })

  ipcMain.handle(
    IPC_CHANNELS.LIBRARY_GET_THUMBNAILS_BATCH,
    (_event, ids: string[]) => {
      const result: Record<string, string> = {}
      for (const id of ids) {
        const media = mediaRepo.getMediaById(db, id)
        if (media?.thumb_path) {
          result[id] = toLibraryUrl(media.thumb_path)
        }
      }
      return result
    }
  )
}
