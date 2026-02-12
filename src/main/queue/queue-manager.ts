import { EventEmitter } from 'events'
import { v4 as uuidv4 } from 'uuid'
import Database from 'better-sqlite3'
import { app } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import sharp from 'sharp'
import { fileURLToPath } from 'url'
import { EngineManager } from '../engine/engine-manager'
import { FileManager } from '../files/file-manager'
import * as generationRepo from '../db/repositories/generations'
import * as generationInputRepo from '../db/repositories/generation-inputs'
import * as mediaRepo from '../db/repositories/media'
import * as queueRepo from '../db/repositories/queue'
import {
  downscaleToMaxPixels,
  generateThumbnail,
  REF_IMAGE_MAX_PIXELS
} from '../files/thumbnail-service'
import type {
  GenerationParams,
  GenerationRecord,
  GenerationInput,
  QueueItem,
  MediaRecord,
  EngineProgressEvent,
  EngineResultEvent
} from '../types'

// =============================================================================
// Queue Manager
// Serial GPU job scheduling. Accepts generation requests, persists them,
// and feeds them to the engine one at a time.
// =============================================================================

export class QueueManager extends EventEmitter {
  private db: Database.Database
  private engineManager: EngineManager
  private fileManager: FileManager
  private isProcessing = false
  private refImagesByGenerationId = new Map<string, string[]>()

  constructor(db: Database.Database, engineManager: EngineManager, fileManager: FileManager) {
    super()
    this.db = db
    this.engineManager = engineManager
    this.fileManager = fileManager

    // Listen for engine progress to forward to subscribers
    this.engineManager.on('progress', (event: EngineProgressEvent) => {
      this.emit('progress', event)
    })

    // When the engine becomes ready (after model load), try to process pending jobs.
    this.engineManager.on('statusChanged', (status) => {
      if (status.state === 'ready') {
        this.processNext().catch(() => {})
      }
    })
  }

  /**
   * Submit a new generation job to the queue.
   * Returns the generation ID.
   */
  async submit(params: GenerationParams): Promise<string> {
    const genId = uuidv4()
    const queueId = uuidv4()
    const now = new Date().toISOString()

    const engineStatus = this.engineManager.getStatus()

    const { inputRecords, refImagesForEngine } = await this.prepareGenerationInputs(
      genId,
      params,
      now
    )

    this.refImagesByGenerationId.set(genId, refImagesForEngine[genId] ?? [])

    // Create generation record
    const generation: GenerationRecord = {
      id: genId,
      number: generationRepo.getNextGenerationNumber(this.db),
      base_model_id: null, // TODO: resolve from loaded model
      provider: 'local',
      model_file: engineStatus.modelName ?? null,
      prompt: params.prompt,
      width: params.width,
      height: params.height,
      seed: params.seed ?? null,
      steps: params.steps ?? 4,
      guidance: params.guidance ?? 3.5,
      sampling_method: params.sampling_method ?? 'euler',
      params_json: null,
      status: 'pending',
      error: null,
      total_time_ms: null,
      prompt_cache_hit: false,
      ref_latent_cache_hit: false,
      output_paths: null,
      created_at: now,
      started_at: null,
      completed_at: null
    }

    generationRepo.insertGeneration(this.db, generation)

    for (const input of inputRecords) {
      generationInputRepo.insertGenerationInput(this.db, input)
    }

    // Create queue record
    const queueItem: QueueItem = {
      id: queueId,
      generation_id: genId,
      status: 'pending',
      priority: 0,
      error_message: null,
      created_at: now,
      started_at: null,
      completed_at: null
    }

    queueRepo.insertQueueItem(this.db, queueItem)

    // Emit queue update
    this.emit('updated')

    // Try to process next job
    this.processNext()

    return genId
  }

  /**
   * Cancel a queued job.
   */
  cancel(jobId: string): void {
    // Find the queue item by generation_id
    const items = queueRepo.getQueueItems(this.db)
    const item = items.find(
      (i) => i.generation_id === jobId && i.status === 'pending'
    )
    if (item) {
      queueRepo.updateQueueStatus(this.db, item.id, 'cancelled')
      this.emit('updated')
    }
  }

  /**
   * Get all queue items.
   */
  getItems(): QueueItem[] {
    return queueRepo.getQueueItems(this.db)
  }

  /**
   * Process the next pending job in the queue.
   */
  private async processNext(): Promise<void> {
    if (this.isProcessing) return

    const engineStatus = this.engineManager.getStatus()
    if (engineStatus.state !== 'ready') return

    const pending = queueRepo.getPendingQueueItems(this.db)
    if (pending.length === 0) return

    const item = pending[0]
    this.isProcessing = true

    try {
      // Mark queue item as processing
      queueRepo.updateQueueStatus(this.db, item.id, 'processing')
      generationRepo.markGenerationStarted(this.db, item.generation_id)
      this.emit('updated')

      // Get generation details
      const gen = generationRepo.getGenerationById(this.db, item.generation_id)
      if (!gen) throw new Error('Generation record not found')

      const tempOutputPath = await this.getTempOutputPath(item.generation_id)

      const refImages =
        this.refImagesByGenerationId.get(item.generation_id) ??
        (await this.getRefImagesForEngine(item.generation_id))

      // Send to engine
      const result: EngineResultEvent = await this.engineManager.generate({
        id: item.generation_id,
        prompt: gen.prompt ?? '',
        width: gen.width ?? 1024,
        height: gen.height ?? 1024,
        seed: gen.seed ?? -1,
        steps: gen.steps ?? 4,
        guidance: gen.guidance ?? 3.5,
        sampling_method: gen.sampling_method ?? 'euler',
        ref_images: refImages,
        output: tempOutputPath,
        use_prompt_cache: true,
        use_ref_latent_cache: true
      })

      if (result.success) {
        const engineOutputPath = await this.resolveEngineOutputPath(
          item.generation_id,
          result.outputPath,
          tempOutputPath
        )

        console.log(
          `[QueueManager] Engine output resolved (generation_id=${item.generation_id}): ${engineOutputPath}`
        )

        const finalMedia = await this.ingestGenerationOutput(item.generation_id, engineOutputPath)

        console.log(
          `[QueueManager] Output ingested into library (generation_id=${item.generation_id}): ${finalMedia.file_path}`
        )

        // Update generation as completed (store final output path)
        generationRepo.updateGenerationComplete(this.db, item.generation_id, {
          status: 'completed',
          seed: result.seed,
          total_time_ms: result.totalTimeMs,
          prompt_cache_hit: result.promptCacheHit,
          ref_latent_cache_hit: result.refLatentCacheHit,
          output_paths: JSON.stringify([finalMedia.file_path])
        })
        queueRepo.updateQueueStatus(this.db, item.id, 'completed')

        this.emit('libraryUpdated', finalMedia)
        this.emit('result', result)
      } else {
        console.warn(
          `[QueueManager] Engine returned unsuccessful result (generation_id=${item.generation_id}): ${result.error ?? 'unknown error'}`
        )
        generationRepo.updateGenerationComplete(this.db, item.generation_id, {
          status: 'failed',
          error: result.error
        })
        queueRepo.updateQueueStatus(this.db, item.id, 'failed', result.error)
        this.emit('result', result)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[QueueManager] Job failed (generation_id=${item.generation_id}):`, err)
      generationRepo.updateGenerationComplete(this.db, item.generation_id, {
        status: 'failed',
        error: message
      })
      queueRepo.updateQueueStatus(this.db, item.id, 'failed', message)
    } finally {
      this.isProcessing = false
      this.refImagesByGenerationId.delete(item.generation_id)
      this.emit('updated')

      // Process next job
      this.processNext()
    }
  }

  private async resolveEngineOutputPath(
    generationId: string,
    resultOutputPath: string | undefined,
    requestedTempOutputPath: string
  ): Promise<string> {
    const candidatesRaw = [resultOutputPath, requestedTempOutputPath].filter(
      (p): p is string => typeof p === 'string' && p.trim().length > 0
    )

    const candidates = candidatesRaw.map((p) => {
      const trimmed = p.trim()
      if (trimmed.startsWith('file://')) {
        try {
          return fileURLToPath(trimmed)
        } catch {
          return trimmed
        }
      }
      return trimmed
    })

    for (const p of candidates) {
      try {
        // Prefer absolute paths; if relative, resolve relative to cwd just to check.
        const abs = path.isAbsolute(p) ? p : path.resolve(process.cwd(), p)
        await fs.promises.access(abs, fs.constants.F_OK)
        return abs
      } catch {
        // try next
      }
    }

    throw new Error(
      `Engine reported success, but output file was not found. generation_id=${generationId}; candidates=${JSON.stringify(
        candidates
      )}`
    )
  }

  private async prepareGenerationInputs(
    generationId: string,
    params: GenerationParams,
    createdAtIso: string
  ): Promise<{ inputRecords: GenerationInput[]; refImagesForEngine: Record<string, string[]> }> {
    const inputRecords: GenerationInput[] = []
    const refImages: string[] = []

    const refThumbsDirAbs = path.join(this.fileManager.getRefThumbsDir(), generationId)
    await fs.promises.mkdir(refThumbsDirAbs, { recursive: true })

    let position = 0

    const ids = params.ref_image_ids ?? []
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
      position++
    }

    const paths = params.ref_image_paths ?? []
    for (const inputPath of paths) {
      const refImageAbs = await this.createRefCacheFile(inputPath)
      refImages.push(refImageAbs)

      const persistedThumbAbs = path.join(refThumbsDirAbs, `${position}.jpg`)
      await this.persistExternalThumbnail(inputPath, persistedThumbAbs)

      const input: GenerationInput = {
        id: uuidv4(),
        generation_id: generationId,
        media_id: null,
        position,
        source_type: 'external',
        original_path: inputPath,
        original_filename: path.basename(inputPath),
        thumb_path: path.join('ref_thumbs', generationId, `${position}.jpg`),
        created_at: createdAtIso
      }
      inputRecords.push(input)
      position++
    }

    return {
      inputRecords,
      refImagesForEngine: { [generationId]: refImages }
    }
  }

  private async persistInputThumbnail(media: MediaRecord, outputAbsPath: string): Promise<void> {
    if (media.thumb_path) {
      const srcAbs = this.fileManager.resolve(media.thumb_path)
      try {
        await fs.promises.copyFile(srcAbs, outputAbsPath)
        return
      } catch {
        // fall back to generating from original
      }
    }

    const originalAbs = this.fileManager.resolve(media.file_path)
    await this.persistExternalThumbnail(originalAbs, outputAbsPath)
  }

  private async persistExternalThumbnail(sourceAbsPath: string, outputAbsPath: string): Promise<void> {
    await fs.promises.mkdir(path.dirname(outputAbsPath), { recursive: true })
    const out = await generateThumbnail(sourceAbsPath, path.dirname(outputAbsPath), path.basename(outputAbsPath, '.jpg'))
    if (!out) {
      return
    }

    // generateThumbnail writes <name>_thumb.jpg; rename to exact desired output
    if (out !== outputAbsPath) {
      await this.moveFile(out, outputAbsPath)
    }
  }

  private async createRefCacheFile(sourceAbsPath: string): Promise<string> {
    const filename = `${uuidv4()}.png`
    const outputAbs = path.join(this.fileManager.getRefCacheDir(), filename)
    await downscaleToMaxPixels(sourceAbsPath, outputAbs, REF_IMAGE_MAX_PIXELS)
    return outputAbs
  }

  private async getRefImagesForEngine(generationId: string): Promise<string[]> {
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

  private async getTempOutputPath(generationId: string): Promise<string> {
    const base = path.join(app.getPath('temp'), 'distillery')
    await fs.promises.mkdir(base, { recursive: true })
    return path.join(base, `gen-${generationId}.png`)
  }

  private async ingestGenerationOutput(generationId: string, engineOutputPath: string): Promise<MediaRecord> {
    const mediaId = uuidv4()
    const now = new Date().toISOString()

    const relDir = this.fileManager.getDateSubdir()
    const absDir = this.fileManager.resolve(relDir)
    await fs.promises.mkdir(absDir, { recursive: true })

    const relFilePath = path.join(relDir, `${mediaId}.png`)
    const absFilePath = this.fileManager.resolve(relFilePath)

    await this.moveFile(engineOutputPath, absFilePath)

    const stat = await fs.promises.stat(absFilePath)

    const thumbAbs = await generateThumbnail(absFilePath, this.fileManager.getThumbnailsDir(), mediaId)
    const relThumbPath = thumbAbs ? path.join('thumbnails', `${mediaId}_thumb.jpg`) : null

    // Sharp metadata for dimensions
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
      file_name: `${mediaId}.png`,
      media_type: 'image',
      origin: 'generation',
      width,
      height,
      file_size: stat.size,
      rating: 0,
      status: null,
      keywords: null,
      generation_id: generationId,
      origin_id: null,
      created_at: now,
      updated_at: now
    }

    mediaRepo.insertMedia(this.db, record)

    return record
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
