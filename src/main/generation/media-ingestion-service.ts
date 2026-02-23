import Database from 'better-sqlite3'
import { app } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { createHash } from 'crypto'
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
import {
  extractVideoThumbnail,
  getVideoMetadata,
  isVideoExtension
} from '../files/video-derivatives'
import type { CanonicalGenerationParams, GenerationInput, MediaRecord } from '../types'
import type { GenerationResult } from './providers/types'

export class MediaIngestionService {
  private static readonly REF_CACHE_KEY_VERSION = 'v1'

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

      const { input, refImageAbs } = await this.prepareInputRecord({
        generationId,
        createdAtIso,
        position,
        sourceType: 'library',
        mediaId: media.id,
        originalPath: media.file_path,
        originalFilename: media.file_name,
        persistThumb: async (outputAbsPath) => this.persistInputThumbnail(media, outputAbsPath)
      })

      inputRecords.push(input)
      refImages.push(refImageAbs)
      position += 1
    }

    const paths = Array.isArray(params.ref_image_paths) ? params.ref_image_paths : []
    for (const sourcePath of paths) {
      const originalAbs = path.isAbsolute(sourcePath) ? sourcePath : path.resolve(sourcePath)
      const { input, refImageAbs } = await this.prepareInputRecord({
        generationId,
        createdAtIso,
        position,
        sourceType: 'external',
        mediaId: null,
        originalPath: originalAbs,
        originalFilename: path.basename(originalAbs),
        persistThumb: async (outputAbsPath) =>
          this.persistExternalThumbnail(originalAbs, outputAbsPath)
      })

      inputRecords.push(input)
      refImages.push(refImageAbs)
      position += 1
    }

    return { inputRecords, refImages }
  }

  private async prepareInputRecord(args: {
    generationId: string
    createdAtIso: string
    position: number
    sourceType: 'library' | 'external'
    mediaId: string | null
    originalPath: string
    originalFilename: string
    persistThumb: (outputAbsPath: string) => Promise<void>
  }): Promise<{ input: GenerationInput; refImageAbs: string }> {
    const thumbRelPath = path.join('ref_thumbs', args.generationId, `${args.position}.jpg`)
    const thumbAbsPath = this.fileManager.resolve(thumbRelPath)
    await args.persistThumb(thumbAbsPath)

    const sourceAbsPath =
      args.sourceType === 'library'
        ? path.isAbsolute(args.originalPath)
          ? args.originalPath
          : this.fileManager.resolve(args.originalPath)
        : args.originalPath

    const refCacheRelPath = await this.getOrCreateRefCacheFile(sourceAbsPath)
    const refImageAbs = this.fileManager.resolve(refCacheRelPath)

    const input: GenerationInput = {
      id: uuidv4(),
      generation_id: args.generationId,
      media_id: args.mediaId,
      position: args.position,
      source_type: args.sourceType,
      original_path: args.originalPath,
      original_filename: args.originalFilename,
      thumb_path: thumbRelPath,
      ref_cache_path: refCacheRelPath,
      created_at: args.createdAtIso
    }

    return { input, refImageAbs }
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
      try {
        const existingCachedAbs = await this.resolveExistingRefCachePath(input)
        if (existingCachedAbs) {
          refImages.push(existingCachedAbs)
          continue
        }

        if (!input.original_path) continue

        const sourceAbsPath =
          input.source_type === 'library'
            ? path.isAbsolute(input.original_path)
              ? input.original_path
              : this.fileManager.resolve(input.original_path)
            : input.original_path

        const refCacheRelPath = await this.getOrCreateRefCacheFile(sourceAbsPath)
        generationInputRepo.updateGenerationInputRefCachePath(this.db, input.id, refCacheRelPath)
        refImages.push(this.fileManager.resolve(refCacheRelPath))
      } catch (error) {
        console.warn(
          `[MediaIngestionService] Failed to prepare ref image for input ${input.id}; generation=${generationId}`,
          error instanceof Error ? error.message : error
        )
      }
    }

    return refImages
  }

  async getOutputDir(generationId: string): Promise<string> {
    const base = path.join(app.getPath('temp'), 'distillery', 'generation-outputs', generationId)
    await fs.promises.mkdir(base, { recursive: true })
    return base
  }

  async finalize(
    generationId: string,
    result: GenerationResult,
    outputType: 'image' | 'video'
  ): Promise<MediaRecord[]> {
    if (!result.success) {
      generationRepo.updateGenerationComplete(this.db, generationId, {
        status: 'failed',
        error: result.error ?? 'Generation failed'
      })
      return []
    }

    const outputs = result.outputs ?? []
    if (outputs.length === 0) {
      generationRepo.updateGenerationComplete(this.db, generationId, {
        status: 'failed',
        error: 'Generation completed without output artifacts'
      })
      return []
    }

    const mediaRecords: MediaRecord[] = []
    for (const output of outputs) {
      const resolvedPath = await this.resolveProviderOutputPath(generationId, output.localPath)
      const media = await this.ingestGenerationOutput(
        generationId,
        resolvedPath,
        output.mimeType,
        outputType
      )
      mediaRecords.push(media)
    }

    generationRepo.updateGenerationComplete(this.db, generationId, {
      status: 'completed',
      seed: result.metrics?.seed,
      total_time_ms: result.metrics?.totalTimeMs,
      prompt_cache_hit: result.metrics?.promptCacheHit,
      ref_latent_cache_hit: result.metrics?.refLatentCacheHit,
      output_paths: JSON.stringify(mediaRecords.map((media) => media.file_path))
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
    mimeType: string | undefined,
    outputType: 'image' | 'video'
  ): Promise<MediaRecord> {
    const mediaId = uuidv4()
    const now = new Date().toISOString()

    const ext = this.resolveExtensionFromMimeOrPath(providerOutputPath, mimeType, outputType)
    const isVideoOutput = outputType === 'video' || isVideoExtension(ext)
    const relDir = this.fileManager.getDateSubdir()
    const absDir = this.fileManager.resolve(relDir)
    await fs.promises.mkdir(absDir, { recursive: true })

    const relFilePath = path.join(relDir, `${mediaId}.${ext}`)
    const absFilePath = this.fileManager.resolve(relFilePath)

    await this.moveFile(providerOutputPath, absFilePath)

    const stat = await fs.promises.stat(absFilePath)

    const thumbAbs = isVideoOutput
      ? await extractVideoThumbnail(absFilePath, this.fileManager.getThumbnailsDir(), mediaId)
      : await createThumbnail(absFilePath, this.fileManager.getThumbnailsDir(), mediaId)
    const relThumbPath = thumbAbs ? path.join('thumbnails', `${mediaId}_thumb.jpg`) : null

    let width: number | null = null
    let height: number | null = null
    let duration: number | null = null

    if (isVideoOutput) {
      try {
        const metadata = await getVideoMetadata(absFilePath)
        width = metadata.width
        height = metadata.height
        duration = metadata.duration
      } catch {
        // ignore
      }
    } else {
      try {
        const meta = await sharp(absFilePath).metadata()
        width = meta.width ?? null
        height = meta.height ?? null
      } catch {
        // ignore
      }
    }

    const record: MediaRecord = {
      id: mediaId,
      file_path: relFilePath,
      thumb_path: relThumbPath,
      file_name: `${mediaId}.${ext}`,
      media_type: isVideoOutput ? 'video' : 'image',
      origin: 'generation',
      width,
      height,
      duration,
      file_size: stat.size,
      rating: 0,
      status: null,
      generation_id: generationId,
      origin_id: null,
      active_upscale_id: null,
      created_at: now,
      updated_at: now
    }

    mediaRepo.insertMedia(this.db, record)

    return record
  }

  private resolveExtensionFromMimeOrPath(
    filePath: string,
    mimeType: string | undefined,
    outputType: 'image' | 'video'
  ): string {
    if (mimeType) {
      if (mimeType.includes('video/mp4')) return 'mp4'
      if (mimeType.includes('video/webm')) return 'webm'
      if (mimeType.includes('video/quicktime')) return 'mov'
      if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg'
      if (mimeType.includes('webp')) return 'webp'
      if (mimeType.includes('png')) return 'png'
    }

    const ext = path.extname(filePath).replace('.', '').toLowerCase()
    if (ext === 'jpg' || ext === 'jpeg' || ext === 'webp' || ext === 'png') {
      return ext === 'jpeg' ? 'jpg' : ext
    }
    if (ext === 'mp4' || ext === 'webm' || ext === 'mov') {
      return ext
    }

    return outputType === 'video' ? 'mp4' : 'png'
  }

  private async persistInputThumbnail(media: MediaRecord, outputAbsPath: string): Promise<void> {
    if (media.thumb_path) {
      const srcAbs = this.fileManager.resolve(media.thumb_path)
      try {
        await fs.promises.copyFile(srcAbs, outputAbsPath)
        return
      } catch {
        // fall through
      }
    }

    const originalSourceAbs = path.isAbsolute(media.file_path)
      ? media.file_path
      : this.fileManager.resolve(media.file_path)
    await this.persistExternalThumbnail(originalSourceAbs, outputAbsPath)
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

  private async resolveExistingRefCachePath(input: GenerationInput): Promise<string | null> {
    if (!input.ref_cache_path) {
      return null
    }

    const cachedAbs = this.fileManager.resolve(input.ref_cache_path)
    try {
      await fs.promises.access(cachedAbs, fs.constants.F_OK)
      return cachedAbs
    } catch {
      return null
    }
  }

  private async getOrCreateRefCacheFile(sourceAbsPath: string): Promise<string> {
    const normalizedSourcePath = path.isAbsolute(sourceAbsPath)
      ? sourceAbsPath
      : path.resolve(sourceAbsPath)
    const refCacheRelPath = await this.buildRefCacheRelativePath(normalizedSourcePath)
    const outputAbs = this.fileManager.resolve(refCacheRelPath)

    try {
      await fs.promises.access(outputAbs, fs.constants.F_OK)
      return refCacheRelPath
    } catch {
      await fs.promises.mkdir(path.dirname(outputAbs), { recursive: true })
      await createReferenceImageDerivative(
        normalizedSourcePath,
        outputAbs,
        REFERENCE_IMAGE_MAX_PIXELS
      )
      return refCacheRelPath
    }
  }

  private async buildRefCacheRelativePath(sourceAbsPath: string): Promise<string> {
    const stat = await fs.promises.stat(sourceAbsPath)

    if (!stat.isFile()) {
      throw new Error(`Reference source is not a file: ${sourceAbsPath}`)
    }

    const sourceDigest = await this.hashFileContents(sourceAbsPath)

    const cacheFingerprint = [
      MediaIngestionService.REF_CACHE_KEY_VERSION,
      String(REFERENCE_IMAGE_MAX_PIXELS),
      sourceDigest,
      String(stat.size)
    ].join('|')

    const key = createHash('sha256').update(cacheFingerprint).digest('hex')
    return path.join('ref_cache', `${key}.png`)
  }

  private async hashFileContents(filePath: string): Promise<string> {
    return await new Promise((resolve, reject) => {
      const hash = createHash('sha256')
      const stream = fs.createReadStream(filePath)

      stream.on('data', (chunk) => {
        hash.update(chunk)
      })

      stream.on('error', reject)
      stream.on('end', () => {
        resolve(hash.digest('hex'))
      })
    })
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
