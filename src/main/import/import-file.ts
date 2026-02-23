import Database from 'better-sqlite3'
import * as fs from 'fs'
import * as path from 'path'
import sharp from 'sharp'
import { v4 as uuidv4 } from 'uuid'

import { FileManager } from '../files/file-manager'
import { createThumbnail } from '../files/image-derivatives'
import {
  extractVideoThumbnail,
  getVideoMetadata,
  isVideoExtension
} from '../files/video-derivatives'
import type { ImportFolderMode, MediaRecord } from '../types'
import * as mediaRepo from '../db/repositories/media'
import * as keywordsRepo from '../db/repositories/keywords'
import * as collectionsRepo from '../db/repositories/collections'

interface ImportSingleFileOptions {
  mode?: ImportFolderMode
  keywords?: string[]
  collectionId?: string
}

async function moveFileWithFallback(sourceAbsPath: string, targetAbsPath: string): Promise<void> {
  try {
    await fs.promises.rename(sourceAbsPath, targetAbsPath)
    return
  } catch (error) {
    const err = error as NodeJS.ErrnoException
    if (err.code !== 'EXDEV') {
      throw error
    }
  }

  await fs.promises.copyFile(sourceAbsPath, targetAbsPath)
  await fs.promises.unlink(sourceAbsPath)
}

export async function importSingleFile(
  fileManager: FileManager,
  db: Database.Database,
  sourcePath: string,
  options?: ImportSingleFileOptions
): Promise<MediaRecord | null> {
  const mode = options?.mode ?? 'copy'
  const sourceAbsPath = path.isAbsolute(sourcePath) ? sourcePath : path.resolve(sourcePath)

  try {
    await fs.promises.access(sourceAbsPath, fs.constants.F_OK)
  } catch {
    return null
  }

  if (mode === 'reference' && mediaRepo.getMediaByFilePath(db, sourceAbsPath)) {
    return null
  }

  const mediaId = uuidv4()
  const now = new Date().toISOString()
  const sourceExt = path.extname(sourceAbsPath).toLowerCase()
  const isVideo = isVideoExtension(sourceExt)

  let storedFilePath: string
  let fileName: string
  let finalAbsPath: string
  let copiedOrMovedToLibrary = false

  if (mode === 'reference') {
    storedFilePath = sourceAbsPath
    fileName = path.basename(sourceAbsPath)
    finalAbsPath = sourceAbsPath
  } else {
    const relDir = fileManager.getDateSubdir()
    const absDir = fileManager.resolve(relDir)
    await fs.promises.mkdir(absDir, { recursive: true })

    const ext = path.extname(sourceAbsPath) || '.png'
    const relFilePath = path.join(relDir, `${mediaId}${ext.toLowerCase()}`)
    finalAbsPath = fileManager.resolve(relFilePath)

    if (mode === 'move') {
      await moveFileWithFallback(sourceAbsPath, finalAbsPath)
    } else {
      await fs.promises.copyFile(sourceAbsPath, finalAbsPath)
    }

    copiedOrMovedToLibrary = true
    storedFilePath = relFilePath
    fileName = path.basename(relFilePath)
  }

  try {
    const stat = await fs.promises.stat(finalAbsPath)

    let width: number | null = null
    let height: number | null = null
    let duration: number | null = null
    let thumbAbsPath: string | null = null

    if (isVideo) {
      const metadata = await getVideoMetadata(finalAbsPath)
      width = metadata.width
      height = metadata.height
      duration = metadata.duration
      thumbAbsPath = await extractVideoThumbnail(
        finalAbsPath,
        fileManager.getThumbnailsDir(),
        mediaId
      )
    } else {
      const meta = await sharp(finalAbsPath).metadata()
      width = meta.width ?? null
      height = meta.height ?? null
      thumbAbsPath = await createThumbnail(finalAbsPath, fileManager.getThumbnailsDir(), mediaId)
    }

    const thumbRelPath = thumbAbsPath ? path.join('thumbnails', `${mediaId}_thumb.jpg`) : null

    const record: MediaRecord = {
      id: mediaId,
      file_path: storedFilePath,
      thumb_path: thumbRelPath,
      file_name: fileName,
      media_type: isVideo ? 'video' : 'image',
      origin: 'import',
      width,
      height,
      duration,
      file_size: stat.size,
      rating: 0,
      status: null,
      generation_id: null,
      origin_id: null,
      active_upscale_id: null,
      created_at: now,
      updated_at: now
    }

    const normalizedKeywords =
      options?.keywords?.map((keyword) => keyword.trim().toLowerCase()).filter(Boolean) ?? []

    db.transaction(() => {
      mediaRepo.insertMedia(db, record)

      if (normalizedKeywords.length > 0) {
        keywordsRepo.setKeywordsForMedia(db, record.id, normalizedKeywords)
      }

      if (options?.collectionId) {
        collectionsRepo.addMediaToCollection(db, options.collectionId, [record.id])
      }
    })()

    return record
  } catch (error) {
    if (copiedOrMovedToLibrary) {
      try {
        await fs.promises.unlink(finalAbsPath)
      } catch {
        // Best-effort cleanup only.
      }
    }

    console.error('[Import] Failed to import single file:', error)
    return null
  }
}
