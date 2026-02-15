import Database from 'better-sqlite3'
import { app } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import sharp from 'sharp'
import { fileURLToPath } from 'url'
import { v4 as uuidv4 } from 'uuid'
import { FileManager } from '../files/file-manager'
import * as generationInputRepo from '../db/repositories/generation-inputs'
import * as generationRepo from '../db/repositories/generations'
import * as mediaRepo from '../db/repositories/media'
import {
  createReferenceImageDerivative,
  createThumbnail,
  REFERENCE_IMAGE_MAX_PIXELS
} from '../files/image-derivatives'
import type {
  CanonicalGenerationParams,
  GenerationExecutionResult,
  GenerationInput,
  MediaRecord
} from '../types'

export class GenerationIOService {
  private db: Database.Database
  private fileManager: FileManager

  constructor(db: Database.Database, fileManager: FileManager) {
    this.db = db
    this.fileManager = fileManager
  }

  async prepareInputs(
    generationId: string,
    params: CanonicalGenerationParams,
    createdAtIso: string
  ): Promise<{ inputRecords: GenerationInput[]; refImages: string[] }> {
    const inputRecords: GenerationInput[] = []
    const refImages: string[] = []

    const refThumbsDirAbs = path.join(this.fileManager.getRefThumbsDir(), generationId)
    await fs.promises.mkdir(refThumbsDirAbs, { recursive: true })

    let position = 0

    const ids = Array.isArray(params.ref_image_ids) ? params.ref_image_ids : []
    for (const mediaId of ids) {
      const media = mediaRepo.getMediaById(this.db, mediaId)
      if (!media) continue

      const originalAbs = this.fileManager.resolve(media.file_path)
      const refImageAbs = await this.createRefCacheFile(originalAbs)
      refImages.push(refImageAbs)

      const persistedThumbAbs = path.join(refThumbsDirAbs, `${position}.jpg`)
      await this.persistInputThumbnail(media, persistedThumbAbs)

      const input: GenerationInput = {
        id: uuidv4(),
        generation_id: generationId,
        media_id: media.id,
        position,
        source_type: 'library',
        original_path: originalAbs,
        original_filename: media.file_name,
        thumb_path: path.join('ref_thumbs', generationId, `${position}.jpg`),
        created_at: createdAtIso
      }

      inputRecords.push(input)
      position += 1
    }

    const paths = Array.isArray(params.ref_image_paths) ? params.ref_image_paths : []
    for (const sourcePath of paths) {
      const refImageAbs = await this.createRefCacheFile(sourcePath)
      refImages.push(refImageAbs)

      const persistedThumbAbs = path.join(refThumbsDirAbs, `${position}.jpg`)
      await this.persistExternalThumbnail(sourcePath, persistedThumbAbs)

      const input: GenerationInput = {
        id: uuidv4(),
        generation_id: generationId,
        media_id: null,
        position,
        source_type: 'external',
        original_path: sourcePath,
        original_filename: path.basename(sourcePath),
        thumb_path: path.join('ref_thumbs', generationId, `${position}.jpg`),
        created_at: createdAtIso
      }

      inputRecords.push(input)
      position += 1
    }

    return { inputRecords, refImages }
  }

  insertInputRecords(inputs: GenerationInput[]): void {
    for (const input of inputs) {
      generationInputRepo.insertGenerationInput(this.db, input)
    }
  }

  async getRefImagesForProvider(generationId: string): Promise<string[]> {
    const inputs = generationInputRepo.getGenerationInputs(this.db, generationId)
    const refImages: string[] = []

    for (const input of inputs) {
      if (!input.original_path) continue
      try {
        const cached = await this.createRefCacheFile(input.original_path)
        refImages.push(cached)
      } catch {
        // ignore failed input
      }
    }

    return refImages
  }

  async getTempOutputPath(generationId: string): Promise<string> {
    const base = path.join(app.getPath('temp'), 'distillery')
    await fs.promises.mkdir(base, { recursive: true })
    return path.join(base, `gen-${generationId}.png`)
  }

  async finalize(result: GenerationExecutionResult): Promise<MediaRecord[]> {
    if (!result.success) {
      generationRepo.updateGenerationComplete(this.db, result.generationId, {
        status: 'failed',
        error: result.error ?? 'Generation failed'
      })
      return []
    }

    const outputs = result.outputs ?? []
    if (outputs.length === 0) {
      generationRepo.updateGenerationComplete(this.db, result.generationId, {
        status: 'failed',
        error: 'Generation completed without output artifacts'
      })
      return []
    }

    const mediaRecords: MediaRecord[] = []
    for (const output of outputs) {
      const resolvedPath = await this.resolveProviderOutputPath(result.generationId, output.providerPath)
      const media = await this.ingestGenerationOutput(result.generationId, resolvedPath, output.mimeType)
      mediaRecords.push(media)
    }

    generationRepo.updateGenerationComplete(this.db, result.generationId, {
      status: 'completed',
      seed: result.metrics?.seed,
      total_time_ms: result.metrics?.totalTimeMs,
      prompt_cache_hit: result.metrics?.promptCacheHit,
      ref_latent_cache_hit: result.metrics?.refLatentCacheHit,
      output_paths: JSON.stringify(mediaRecords.map((m) => m.file_path))
    })

    return mediaRecords
  }

  private async resolveProviderOutputPath(generationId: string, outputPath: string): Promise<string> {
    const trimmed = outputPath.trim()

    let candidate = trimmed
    if (trimmed.startsWith('file://')) {
      try {
        candidate = fileURLToPath(trimmed)
      } catch {
        candidate = trimmed
      }
    }

    const abs = path.isAbsolute(candidate) ? candidate : path.resolve(process.cwd(), candidate)

    try {
      await fs.promises.access(abs, fs.constants.F_OK)
      return abs
    } catch {
      throw new Error(
        `Provider output file not found. generation_id=${generationId}; candidate=${candidate}`
      )
    }
  }

  private async ingestGenerationOutput(
    generationId: string,
    providerOutputPath: string,
    mimeType?: string
  ): Promise<MediaRecord> {
    const mediaId = uuidv4()
    const now = new Date().toISOString()

    const ext = this.resolveExtensionFromMimeOrPath(providerOutputPath, mimeType)
    const relDir = this.fileManager.getDateSubdir()
    const absDir = this.fileManager.resolve(relDir)
    await fs.promises.mkdir(absDir, { recursive: true })

    const relFilePath = path.join(relDir, `${mediaId}.${ext}`)
    const absFilePath = this.fileManager.resolve(relFilePath)

    await this.moveFile(providerOutputPath, absFilePath)

    const stat = await fs.promises.stat(absFilePath)

    const thumbAbs = await createThumbnail(absFilePath, this.fileManager.getThumbnailsDir(), mediaId)
    const relThumbPath = thumbAbs ? path.join('thumbnails', `${mediaId}_thumb.jpg`) : null

    let width: number | null = null
    let height: number | null = null
    try {
      const meta = await sharp(absFilePath).metadata()
      width = meta.width ?? null
      height = meta.height ?? null
    } catch {
      // ignore
    }

    const record: MediaRecord = {
      id: mediaId,
      file_path: relFilePath,
      thumb_path: relThumbPath,
      file_name: `${mediaId}.${ext}`,
      media_type: 'image',
      origin: 'generation',
      width,
      height,
      file_size: stat.size,
      rating: 0,
      status: null,
      generation_id: generationId,
      origin_id: null,
      created_at: now,
      updated_at: now
    }

    mediaRepo.insertMedia(this.db, record)

    return record
  }

  private resolveExtensionFromMimeOrPath(filePath: string, mimeType?: string): string {
    if (mimeType) {
      if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg'
      if (mimeType.includes('webp')) return 'webp'
      if (mimeType.includes('png')) return 'png'
    }

    const ext = path.extname(filePath).replace('.', '').toLowerCase()
    if (ext === 'jpg' || ext === 'jpeg' || ext === 'webp' || ext === 'png') {
      return ext === 'jpeg' ? 'jpg' : ext
    }

    return 'png'
  }

  private async persistInputThumbnail(media: MediaRecord, outputAbsPath: string): Promise<void> {
    if (media.thumb_path) {
      const srcAbs = this.fileManager.resolve(media.thumb_path)
      try {
        await fs.promises.copyFile(srcAbs, outputAbsPath)
        return
      } catch {
        // fall through to source file thumbnail generation
      }
    }

    const originalAbs = this.fileManager.resolve(media.file_path)
    await this.persistExternalThumbnail(originalAbs, outputAbsPath)
  }

  private async persistExternalThumbnail(sourceAbsPath: string, outputAbsPath: string): Promise<void> {
    await fs.promises.mkdir(path.dirname(outputAbsPath), { recursive: true })
    const out = await createThumbnail(
      sourceAbsPath,
      path.dirname(outputAbsPath),
      path.basename(outputAbsPath, '.jpg')
    )

    if (!out) return

    if (out !== outputAbsPath) {
      await this.moveFile(out, outputAbsPath)
    }
  }

  private async createRefCacheFile(sourceAbsPath: string): Promise<string> {
    const filename = `${uuidv4()}.png`
    const outputAbs = path.join(this.fileManager.getRefCacheDir(), filename)
    await createReferenceImageDerivative(sourceAbsPath, outputAbs, REFERENCE_IMAGE_MAX_PIXELS)
    return outputAbs
  }

  private async moveFile(from: string, to: string): Promise<void> {
    await fs.promises.mkdir(path.dirname(to), { recursive: true })
    try {
      await fs.promises.rename(from, to)
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code !== 'EXDEV') throw err
      await fs.promises.copyFile(from, to)
      await fs.promises.unlink(from)
    }
  }
}
