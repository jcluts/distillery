import { EventEmitter } from 'events'
import Database from 'better-sqlite3'
import * as fs from 'fs'
import type {
  UpscaleModelInfo,
  UpscaleRequest,
  UpscaleVariant,
  UpscaleProgressEvent,
  UpscaleResultEvent
} from '../types'
import { UpscaleModelService } from './upscale-model-service'
import { FileManager } from '../files/file-manager'
import { WorkQueueManager } from '../queue/work-queue-manager'
import { WORK_TASK_TYPES } from '../queue/work-task-types'
import * as variantRepo from '../db/repositories/upscale-variants'

export class UpscaleService extends EventEmitter {
  private db: Database.Database
  private fileManager: FileManager
  private modelService: UpscaleModelService
  private workQueueManager: WorkQueueManager

  constructor(deps: {
    db: Database.Database
    fileManager: FileManager
    modelService: UpscaleModelService
    workQueueManager: WorkQueueManager
  }) {
    super()
    this.db = deps.db
    this.fileManager = deps.fileManager
    this.modelService = deps.modelService
    this.workQueueManager = deps.workQueueManager
  }

  async submit(request: UpscaleRequest): Promise<string> {
    const payload = JSON.stringify({
      mediaId: request.mediaId,
      modelId: request.modelId,
      scaleFactor: request.scaleFactor
    })

    return this.workQueueManager.enqueue({
      task_type: WORK_TASK_TYPES.UPSCALE,
      payload_json: payload,
      correlation_id: request.mediaId,
      owner_module: 'upscale'
    })
  }

  async cancel(mediaId: string): Promise<void> {
    const pending = this.workQueueManager.getPendingByCorrelationId(mediaId)
    if (pending) {
      this.workQueueManager.cancel(pending.id)
    }
  }

  setActiveVariant(mediaId: string, variantId: string | null): void {
    variantRepo.setActiveVariant(this.db, mediaId, variantId)
  }

  deleteVariant(variantId: string): void {
    const variant = variantRepo.getVariant(this.db, variantId)
    if (!variant) return

    // If this variant was active, clear the active reference
    variantRepo.setActiveVariant(this.db, variant.media_id, null)

    // Delete file from disk
    const absPath = this.fileManager.resolve(variant.file_path)
    try {
      if (fs.existsSync(absPath)) fs.unlinkSync(absPath)
    } catch (err) {
      console.warn('[UpscaleService] Failed to delete variant file:', absPath, err)
    }

    variantRepo.deleteVariant(this.db, variantId)
  }

  deleteAllVariants(mediaId: string): void {
    const variants = variantRepo.getVariantsForMedia(this.db, mediaId)
    for (const v of variants) {
      const absPath = this.fileManager.resolve(v.file_path)
      try {
        if (fs.existsSync(absPath)) fs.unlinkSync(absPath)
      } catch (err) {
        console.warn('[UpscaleService] Failed to delete variant file:', absPath, err)
      }
    }
    variantRepo.setActiveVariant(this.db, mediaId, null)
    variantRepo.deleteAllVariantsForMedia(this.db, mediaId)
  }

  getUpscaleData(mediaId: string): {
    variants: UpscaleVariant[]
    activeVariantId: string | null
  } {
    const variants = variantRepo.getVariantsForMedia(this.db, mediaId)
    const active = variantRepo.getActiveVariant(this.db, mediaId)
    return {
      variants,
      activeVariantId: active?.id ?? null
    }
  }

  getModels(): UpscaleModelInfo[] {
    return this.modelService.getModels()
  }

  emitProgress(event: UpscaleProgressEvent): void {
    this.emit('progress', event)
  }

  emitResult(event: UpscaleResultEvent): void {
    this.emit('result', event)
  }
}
