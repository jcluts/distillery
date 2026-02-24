import { ipcMain } from 'electron'
import * as path from 'path'

import { getDatabase } from '../../db/connection'
import * as mediaRepo from '../../db/repositories/media'
import * as variantRepo from '../../db/repositories/upscale-variants'
import { regenerateThumbnail } from '../../files/image-derivatives'
import type { FileManager } from '../../files/file-manager'
import type { ImageTransforms, MediaRecord } from '../../types'
import { IPC_CHANNELS } from '../channels'

function resolveAbsolutePath(fileManager: FileManager, inputPath: string): string {
  return path.isAbsolute(inputPath) ? inputPath : fileManager.resolve(inputPath)
}

function resolveThumbnailPath(fileManager: FileManager, media: MediaRecord): string | null {
  if (!media.thumb_path) {
    return null
  }
  return resolveAbsolutePath(fileManager, media.thumb_path)
}

function resolveSourcePath(
  db: import('better-sqlite3').Database,
  fileManager: FileManager,
  media: MediaRecord
): string {
  let sourcePath = media.file_path

  if (media.active_upscale_id) {
    const variant = variantRepo.getVariant(db, media.active_upscale_id)
    if (variant) {
      sourcePath = variant.file_path
    }
  }

  return resolveAbsolutePath(fileManager, sourcePath)
}

export function registerTransformsHandlers(
  fileManager: FileManager,
  options?: { onLibraryUpdated?: () => void }
): void {
  const db = getDatabase()

  ipcMain.handle(IPC_CHANNELS.TRANSFORMS_GET, (_event, mediaId: string) => {
    return mediaRepo.getTransforms(db, mediaId)
  })

  ipcMain.handle(
    IPC_CHANNELS.TRANSFORMS_SAVE,
    async (_event, mediaId: string, transforms: ImageTransforms | null) => {
      const media = mediaRepo.getMediaById(db, mediaId)
      if (!media) {
        throw new Error(`Media not found: ${mediaId}`)
      }

      mediaRepo.saveTransforms(db, mediaId, transforms)

      if (media.media_type === 'image') {
        const thumbPath = resolveThumbnailPath(fileManager, media)
        if (thumbPath) {
          try {
            const sourcePath = resolveSourcePath(db, fileManager, media)
            await regenerateThumbnail(sourcePath, thumbPath, transforms)
          } catch (error) {
            console.warn(
              `[Transforms] Failed to regenerate thumbnail for media ${mediaId}:`,
              error
            )
          }
        }
      }

      options?.onLibraryUpdated?.()
    }
  )
}
