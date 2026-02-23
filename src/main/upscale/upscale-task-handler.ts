import { v4 as uuidv4 } from 'uuid'
import * as path from 'path'
import sharp from 'sharp'
import Database from 'better-sqlite3'
import type { WorkItem, WorkTaskResult, UpscaleVariant } from '../types'
import type { WorkTaskHandler } from '../queue/work-handler-registry'
import { EngineManager } from '../engine/engine-manager'
import { UpscaleModelService } from './upscale-model-service'
import { UpscaleService } from './upscale-service'
import { FileManager } from '../files/file-manager'
import * as mediaRepo from '../db/repositories/media'
import * as variantRepo from '../db/repositories/upscale-variants'

export class UpscaleTaskHandler implements WorkTaskHandler {
  private db: Database.Database
  private engineManager: EngineManager
  private modelService: UpscaleModelService
  private upscaleService: UpscaleService
  private fileManager: FileManager

  constructor(deps: {
    db: Database.Database
    engineManager: EngineManager
    modelService: UpscaleModelService
    upscaleService: UpscaleService
    fileManager: FileManager
  }) {
    this.db = deps.db
    this.engineManager = deps.engineManager
    this.modelService = deps.modelService
    this.upscaleService = deps.upscaleService
    this.fileManager = deps.fileManager
  }

  async execute(item: WorkItem): Promise<WorkTaskResult> {
    const payload = JSON.parse(item.payload_json) as {
      mediaId: string
      modelId: string
      scaleFactor: number
    }

    const { mediaId, modelId, scaleFactor } = payload

    try {
      // 1. Emit preparing phase
      this.upscaleService.emitProgress({ mediaId, phase: 'preparing' })

      // 2. Resolve the media's original file
      const media = mediaRepo.getMediaById(this.db, mediaId)
      if (!media) throw new Error(`Media not found: ${mediaId}`)

      const inputAbsPath = this.fileManager.resolve(media.file_path)

      // 3. Resolve the upscale model path
      const modelAbsPath = this.modelService.resolveModelAbsolutePath(modelId)
      if (!modelAbsPath) throw new Error(`Upscale model not available: ${modelId}`)

      const modelConfig = this.modelService.getModelConfig(modelId)
      if (!modelConfig) throw new Error(`Upscale model config not found: ${modelId}`)

      // 4. Generate output path
      const variantId = uuidv4()
      const relFilePath = path.join('upscaled', `${variantId}.png`)
      const outputAbsPath = this.fileManager.resolve(relFilePath)

      // 5. Send upscale command to engine
      this.upscaleService.emitProgress({ mediaId, phase: 'upscaling' })

      const progressListener = (event: any) => {
        if (event.jobId === `upscale-${variantId}`) {
          this.upscaleService.emitProgress({
            mediaId,
            phase: 'upscaling',
            step: event.step,
            totalSteps: event.totalSteps,
            message: event.message
          })
        }
      }
      this.engineManager.on('progress', progressListener)

      let result
      try {
        result = await this.engineManager.upscale({
          id: `upscale-${variantId}`,
          input: inputAbsPath,
          output: outputAbsPath,
          upscale_model: modelAbsPath,
          upscale_repeats: 1
        })
      } finally {
        this.engineManager.off('progress', progressListener)
      }

      if (!result.success) {
        throw new Error(result.error ?? 'Upscale failed')
      }

      // 6. Post-processing: downsample if requested scale < native scale
      this.upscaleService.emitProgress({ mediaId, phase: 'saving' })

      let finalWidth: number
      let finalHeight: number

      if (scaleFactor < modelConfig.nativeScale && media.width && media.height) {
        const targetWidth = media.width * scaleFactor
        const targetHeight = media.height * scaleFactor
        await sharp(outputAbsPath)
          .resize(targetWidth, targetHeight, { kernel: sharp.kernel.lanczos3 })
          .png()
          .toFile(outputAbsPath + '.tmp')

        const fs = await import('fs')
        await fs.promises.rename(outputAbsPath + '.tmp', outputAbsPath)
        finalWidth = targetWidth
        finalHeight = targetHeight
      } else {
        const meta = await sharp(outputAbsPath).metadata()
        finalWidth = meta.width ?? 0
        finalHeight = meta.height ?? 0
      }

      // 7. Get file size
      const fsModule = await import('fs')
      const stat = await fsModule.promises.stat(outputAbsPath)

      // 8. Insert variant record
      const now = new Date().toISOString()
      const variant: UpscaleVariant = {
        id: variantId,
        media_id: mediaId,
        file_path: relFilePath,
        model_id: modelId,
        model_name: modelConfig.name,
        scale_factor: scaleFactor,
        width: finalWidth,
        height: finalHeight,
        file_size: stat.size,
        created_at: now
      }

      variantRepo.insertVariant(this.db, variant)

      // 9. Set as active variant
      variantRepo.setActiveVariant(this.db, mediaId, variantId)

      // 10. Emit result
      this.upscaleService.emitProgress({ mediaId, phase: 'complete' })
      this.upscaleService.emitResult({ 
        mediaId, 
        success: true, 
        variant,
        totalTimeMs: result.totalTimeMs
      })

      return { success: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.upscaleService.emitProgress({ mediaId, phase: 'error', message })
      this.upscaleService.emitResult({ mediaId, success: false, error: message })
      return { success: false, error: message }
    }
  }
}
