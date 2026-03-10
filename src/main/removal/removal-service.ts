import { EventEmitter } from 'events'
import * as fs from 'fs'
import * as path from 'path'
import Database from 'better-sqlite3'

import * as mediaRepo from '../db/repositories/media'
import * as variantRepo from '../db/repositories/upscale-variants'
import { regenerateThumbnail } from '../files/image-derivatives'
import { FileManager } from '../files/file-manager'
import { WorkQueueManager } from '../queue/work-queue-manager'
import { WORK_TASK_TYPES } from '../queue/work-task-types'
import type {
  MediaRecord,
  RemovalCache,
  RemovalData,
  RemovalOperation,
  RemovalProgressEvent,
  RemovalResultEvent,
  RemovalStateSnapshot
} from '../types'
import { buildBaseSourceHash, buildOperationSourceHash } from './removal-hash'

interface RemovalServiceDeps {
  db: Database.Database
  fileManager: FileManager
  workQueueManager: WorkQueueManager
}

interface OperationEvaluation {
  operationId: string
  expectedSourceHash: string
  sourcePath: string
  stale: boolean
}

export interface RemovalOperationContext {
  media: MediaRecord
  operation: RemovalOperation
  expectedSourceHash: string
  sourcePath: string
  stale: boolean
}

interface BaseSourceState {
  sourcePath: string
  sourceHash: string
}

function normalizeData(data: RemovalData | null): RemovalData | null {
  if (!data) {
    return null
  }

  if (data.version !== 1 || !Array.isArray(data.operations)) {
    return null
  }

  return {
    version: 1,
    operations: data.operations.map((operation) => ({
      id: operation.id,
      strokes: Array.isArray(operation.strokes) ? operation.strokes : [],
      featherRadiusNormalized: Number.isFinite(operation.featherRadiusNormalized)
        ? operation.featherRadiusNormalized
        : 0.01,
      enabled: operation.enabled !== false,
      timestamp: operation.timestamp ?? new Date().toISOString(),
      cache: operation.cache
        ? {
            sourceHash: operation.cache.sourceHash,
            resultPath: operation.cache.resultPath,
            width: operation.cache.width,
            height: operation.cache.height,
            timestamp: operation.cache.timestamp
          }
        : null
    }))
  }
}

export class RemovalService extends EventEmitter {
  private db: Database.Database
  private fileManager: FileManager
  private workQueueManager: WorkQueueManager

  constructor(deps: RemovalServiceDeps) {
    super()
    this.db = deps.db
    this.fileManager = deps.fileManager
    this.workQueueManager = deps.workQueueManager
  }

  getData(mediaId: string): RemovalData | null {
    return normalizeData(mediaRepo.getRemovals(this.db, mediaId))
  }

  getState(mediaId: string): RemovalStateSnapshot {
    const media = mediaRepo.getMediaById(this.db, mediaId)
    if (!media) {
      return { data: null, staleOperationIds: [] }
    }

    const data = this.getData(mediaId)
    if (!data) {
      return { data: null, staleOperationIds: [] }
    }

    const evaluations = this.evaluateOperations(media, data)
    return {
      data,
      staleOperationIds: evaluations
        .filter((entry) => entry.stale)
        .map((entry) => entry.operationId)
    }
  }

  saveData(mediaId: string, data: RemovalData | null): void {
    mediaRepo.saveRemovals(this.db, mediaId, normalizeData(data))
  }

  async process(mediaId: string, operationId: string): Promise<string> {
    const data = this.getData(mediaId)
    const operation = data?.operations.find((entry) => entry.id === operationId)
    if (!operation) {
      throw new Error(`Removal operation not found: media=${mediaId} operation=${operationId}`)
    }

    return await this.workQueueManager.enqueue({
      task_type: WORK_TASK_TYPES.REMOVAL,
      payload_json: JSON.stringify({ mediaId, operationId }),
      correlation_id: mediaId,
      owner_module: 'removal',
      max_attempts: 1
    })
  }

  async processAllStale(mediaId: string): Promise<string[]> {
    const media = mediaRepo.getMediaById(this.db, mediaId)
    if (!media) {
      throw new Error(`Media not found: ${mediaId}`)
    }

    const data = this.getData(mediaId)
    if (!data || data.operations.length === 0) {
      return []
    }

    const evaluations = this.evaluateOperations(media, data)
    const staleEnabledOperationIds = evaluations
      .filter((evaluation, index) => evaluation.stale && data.operations[index].enabled)
      .map((evaluation) => evaluation.operationId)

    const queuedIds: string[] = []
    for (const operationId of staleEnabledOperationIds) {
      const taskId = await this.process(mediaId, operationId)
      queuedIds.push(taskId)
    }

    return queuedIds
  }

  getStaleOperationIds(mediaId: string): string[] {
    const media = mediaRepo.getMediaById(this.db, mediaId)
    if (!media) {
      return []
    }

    const data = this.getData(mediaId)
    if (!data) {
      return []
    }

    return this.evaluateOperations(media, data)
      .filter((entry) => entry.stale)
      .map((entry) => entry.operationId)
  }

  async deleteCaches(mediaId: string, operationIds?: string[]): Promise<void> {
    const data = this.getData(mediaId)
    if (!data) {
      return
    }

    const targetIds = operationIds ? new Set(operationIds) : null
    let updated = false

    for (const operation of data.operations) {
      if (targetIds && !targetIds.has(operation.id)) {
        continue
      }

      if (operation.cache?.resultPath) {
        const absPath = this.resolvePath(operation.cache.resultPath)
        try {
          await fs.promises.unlink(absPath)
        } catch (error) {
          const err = error as NodeJS.ErrnoException
          if (err.code !== 'ENOENT') {
            console.warn('[RemovalService] Failed to delete cache file:', absPath, err)
          }
        }
      }

      if (operation.cache) {
        operation.cache = null
        updated = true
      }
    }

    if (updated) {
      this.saveData(mediaId, data)
    }
  }

  resolveEffectivePath(media: MediaRecord): string {
    const base = this.getBaseSource(media)
    const data = this.getData(media.id)
    if (!data || data.operations.length === 0) {
      return base.sourcePath
    }

    const evaluations = this.evaluateOperations(media, data)
    for (let index = data.operations.length - 1; index >= 0; index -= 1) {
      const operation = data.operations[index]
      const evaluation = evaluations[index]
      if (!operation.enabled || !operation.cache || evaluation.stale) {
        continue
      }

      return operation.cache.resultPath
    }

    return base.sourcePath
  }

  resolveEffectiveAbsolutePath(media: MediaRecord): string {
    return this.resolvePath(this.resolveEffectivePath(media))
  }

  getOperationContext(mediaId: string, operationId: string): RemovalOperationContext {
    const media = mediaRepo.getMediaById(this.db, mediaId)
    if (!media) {
      throw new Error(`Media not found: ${mediaId}`)
    }

    const data = this.getData(mediaId)
    if (!data) {
      throw new Error(`Removal data not found for media: ${mediaId}`)
    }

    const operationIndex = data.operations.findIndex((operation) => operation.id === operationId)
    if (operationIndex < 0) {
      throw new Error(`Removal operation not found: ${operationId}`)
    }

    const evaluations = this.evaluateOperations(media, data)
    const evaluation = evaluations[operationIndex]

    return {
      media,
      operation: data.operations[operationIndex],
      expectedSourceHash: evaluation.expectedSourceHash,
      sourcePath: evaluation.sourcePath,
      stale: evaluation.stale
    }
  }

  updateOperationCache(mediaId: string, operationId: string, cache: RemovalCache): void {
    const data = this.getData(mediaId)
    if (!data) {
      throw new Error(`Removal data not found for media: ${mediaId}`)
    }

    const operation = data.operations.find((entry) => entry.id === operationId)
    if (!operation) {
      throw new Error(`Removal operation not found: ${operationId}`)
    }

    operation.cache = cache
    this.saveData(mediaId, data)
  }

  async refreshThumbnail(mediaId: string): Promise<void> {
    const media = mediaRepo.getMediaById(this.db, mediaId)
    if (!media || media.media_type !== 'image' || !media.thumb_path) {
      return
    }

    const sourcePath = this.resolveEffectiveAbsolutePath(media)
    const thumbPath = this.resolvePath(media.thumb_path)
    const transforms = mediaRepo.getTransforms(this.db, media.id)

    await regenerateThumbnail(sourcePath, thumbPath, transforms)
  }

  emitProgress(event: RemovalProgressEvent): void {
    this.emit('progress', event)
  }

  emitResult(event: RemovalResultEvent): void {
    this.emit('result', event)
  }

  private evaluateOperations(media: MediaRecord, data: RemovalData): OperationEvaluation[] {
    const evaluations: OperationEvaluation[] = []

    const base = this.getBaseSource(media)
    let chainSourcePath = base.sourcePath
    let chainSourceHash = base.sourceHash

    for (const operation of data.operations) {
      const expectedSourceHash = chainSourceHash
      const cachePath = operation.cache?.resultPath
      const cacheExists = cachePath ? fs.existsSync(this.resolvePath(cachePath)) : false
      const stale =
        !operation.cache || !cacheExists || operation.cache.sourceHash !== expectedSourceHash

      evaluations.push({
        operationId: operation.id,
        expectedSourceHash,
        sourcePath: chainSourcePath,
        stale
      })

      if (!operation.enabled) {
        continue
      }

      if (stale || !operation.cache) {
        continue
      }

      chainSourcePath = operation.cache.resultPath
      chainSourceHash = buildOperationSourceHash(
        operation.cache.resultPath,
        operation.cache.sourceHash
      )
    }

    return evaluations
  }

  private getBaseSource(media: MediaRecord): BaseSourceState {
    let sourcePath = media.file_path

    if (media.active_upscale_id) {
      const activeVariant = variantRepo.getVariant(this.db, media.active_upscale_id)
      if (activeVariant) {
        sourcePath = activeVariant.file_path
      }
    }

    return {
      sourcePath,
      sourceHash: buildBaseSourceHash(media.file_path, media.active_upscale_id)
    }
  }

  private resolvePath(inputPath: string): string {
    return path.isAbsolute(inputPath) ? inputPath : this.fileManager.resolve(inputPath)
  }
}
