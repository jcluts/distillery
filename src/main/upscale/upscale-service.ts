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
import * as settingsRepo from '../db/repositories/settings'

type SourceChangeHandler = (mediaId: string) => Promise<void>

export class UpscaleService extends EventEmitter {
  private db: Database.Database
  private fileManager: FileManager
  private modelService: UpscaleModelService
  private workQueueManager: WorkQueueManager
  private onSourceChanged: SourceChangeHandler | null

  constructor(deps: {
    db: Database.Database
    fileManager: FileManager
    modelService: UpscaleModelService
    workQueueManager: WorkQueueManager
    onSourceChanged?: SourceChangeHandler
  }) {
    super()
    this.db = deps.db
    this.fileManager = deps.fileManager
    this.modelService = deps.modelService
    this.workQueueManager = deps.workQueueManager
    this.onSourceChanged = deps.onSourceChanged ?? null
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

  async setActiveVariant(mediaId: string, variantId: string | null): Promise<void> {
    const currentVariantId = variantRepo.getActiveVariant(this.db, mediaId)?.id ?? null
    if (currentVariantId === variantId) {
      return
    }

    variantRepo.setActiveVariant(this.db, mediaId, variantId)
    await this.handleSourceChanged(mediaId)
  }

  async deleteVariant(variantId: string): Promise<void> {
    const variant = variantRepo.getVariant(this.db, variantId)
    if (!variant) return

    const activeVariantId = variantRepo.getActiveVariant(this.db, variant.media_id)?.id ?? null
    const wasActive = activeVariantId === variantId

    // If this variant was active, clear the active reference
    if (wasActive) {
      variantRepo.setActiveVariant(this.db, variant.media_id, null)
    }

    // Delete file from disk
    const absPath = this.fileManager.resolve(variant.file_path)
    try {
      if (fs.existsSync(absPath)) fs.unlinkSync(absPath)
    } catch (err) {
      console.warn('[UpscaleService] Failed to delete variant file:', absPath, err)
    }

    variantRepo.deleteVariant(this.db, variantId)

    if (wasActive) {
      await this.handleSourceChanged(variant.media_id)
    }
  }

  async deleteAllVariants(mediaId: string): Promise<void> {
    const variants = variantRepo.getVariantsForMedia(this.db, mediaId)
    const hadActiveVariant = (variantRepo.getActiveVariant(this.db, mediaId)?.id ?? null) !== null

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

    if (hadActiveVariant) {
      await this.handleSourceChanged(mediaId)
    }
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
    const backendPreference = settingsRepo.getSetting(this.db, 'upscale_backend')
    return this.modelService.getModels(backendPreference)
  }

  emitProgress(event: UpscaleProgressEvent): void {
    this.emit('progress', event)
  }

  emitResult(event: UpscaleResultEvent): void {
    this.emit('result', event)
  }

  private async handleSourceChanged(mediaId: string): Promise<void> {
    if (!this.onSourceChanged) {
      return
    }

    try {
      await this.onSourceChanged(mediaId)
    } catch (error) {
      console.warn('[UpscaleService] Failed to update source-dependent edits:', error)
    }
  }
}
