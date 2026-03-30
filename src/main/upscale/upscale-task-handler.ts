import { v4 as uuidv4 } from 'uuid'
import * as path from 'path'
import Database from 'better-sqlite3'
import type { WorkItem, WorkTaskResult, UpscaleVariant } from '../types'
import type { WorkTaskHandler } from '../queue/work-handler-registry'
import { UpscaleService } from './upscale-service'
import { FileManager } from '../files/file-manager'
import * as mediaRepo from '../db/repositories/media'
import * as variantRepo from '../db/repositories/upscale-variants'
import { UpscaleExecutionService } from './upscale-execution-service'

export class UpscaleTaskHandler implements WorkTaskHandler {
  private db: Database.Database
  private upscaleService: UpscaleService
  private fileManager: FileManager
  private executionService: UpscaleExecutionService

  constructor(deps: {
    db: Database.Database
    upscaleService: UpscaleService
    fileManager: FileManager
    executionService: UpscaleExecutionService
  }) {
    this.db = deps.db
    this.upscaleService = deps.upscaleService
    this.fileManager = deps.fileManager
    this.executionService = deps.executionService
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

      const inputAbsPath = path.isAbsolute(media.file_path)
        ? media.file_path
        : this.fileManager.resolve(media.file_path)

      // 3. Generate output path
      const variantId = uuidv4()
      const relFilePath = path.join('upscaled', `${variantId}.png`)
      const outputAbsPath = this.fileManager.resolve(relFilePath)

      // 4. Run the configured backend
      this.upscaleService.emitProgress({ mediaId, phase: 'upscaling' })

      const result = await this.executionService.execute({
        media,
        modelId,
        scaleFactor,
        variantId,
        inputAbsPath,
        outputAbsPath,
        onProgress: (progress) => {
          this.upscaleService.emitProgress({
            mediaId,
            phase: 'upscaling',
            step: progress.step,
            totalSteps: progress.totalSteps,
            message: progress.message
          })
        }
      })

      // 5. Save output
      this.upscaleService.emitProgress({ mediaId, phase: 'saving' })
      const fsModule = await import('fs')
      const stat = await fsModule.promises.stat(outputAbsPath)

      // 6. Insert variant record
      const now = new Date().toISOString()
      const variant: UpscaleVariant = {
        id: variantId,
        media_id: mediaId,
        file_path: relFilePath,
        model_id: modelId,
        model_name: `${result.modelConfig.name} (${result.backend === 'onnx' ? 'ONNX' : 'cn-engine'})`,
        scale_factor: scaleFactor,
        width: result.width,
        height: result.height,
        file_size: stat.size,
        created_at: now
      }

      variantRepo.insertVariant(this.db, variant)

      // 7. Set as active variant and reapply source-dependent edits.
      await this.upscaleService.setActiveVariant(mediaId, variantId)

      // 8. Emit result
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
