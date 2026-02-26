import * as fs from 'fs'
import * as path from 'path'
import { v4 as uuidv4 } from 'uuid'

import type { WorkItem, WorkTaskResult } from '../types'
import type { WorkTaskHandler } from '../queue/work-handler-registry'
import { FileManager } from '../files/file-manager'
import { LamaInference } from './lama-inference'
import { processRemoval } from './removal-processor'
import { RemovalService } from './removal-service'

interface RemovalTaskPayload {
  mediaId: string
  operationId: string
}

export class RemovalTaskHandler implements WorkTaskHandler {
  private fileManager: FileManager
  private removalService: RemovalService
  private inference: LamaInference

  constructor(deps: {
    fileManager: FileManager
    removalService: RemovalService
  }) {
    this.fileManager = deps.fileManager
    this.removalService = deps.removalService
    this.inference = new LamaInference()
  }

  async execute(item: WorkItem): Promise<WorkTaskResult> {
    const payload = JSON.parse(item.payload_json) as RemovalTaskPayload
    const { mediaId, operationId } = payload

    try {
      const context = this.removalService.getOperationContext(mediaId, operationId)
      const sourceAbsPath = path.isAbsolute(context.sourcePath)
        ? context.sourcePath
        : this.fileManager.resolve(context.sourcePath)

      const outputRelativePath = path.join('removals', `${uuidv4()}.jpg`)
      const outputAbsPath = this.fileManager.resolve(outputRelativePath)

      this.removalService.emitProgress({
        mediaId,
        operationId,
        phase: 'preparing',
        message: 'Preparing removal task'
      })

      const oldCachePath = context.operation.cache?.resultPath ?? null

      const result = await processRemoval({
        sourcePath: sourceAbsPath,
        outputPath: outputAbsPath,
        operation: context.operation,
        inference: this.inference,
        onProgress: (phase, message) => {
          this.removalService.emitProgress({ mediaId, operationId, phase, message })
        }
      })

      this.removalService.updateOperationCache(mediaId, operationId, {
        sourceHash: context.expectedSourceHash,
        resultPath: outputRelativePath,
        width: result.width,
        height: result.height,
        timestamp: new Date().toISOString()
      })

      if (oldCachePath && oldCachePath !== outputRelativePath) {
        try {
          const oldAbsPath = path.isAbsolute(oldCachePath)
            ? oldCachePath
            : this.fileManager.resolve(oldCachePath)
          await fs.promises.unlink(oldAbsPath)
        } catch (error) {
          const err = error as NodeJS.ErrnoException
          if (err.code !== 'ENOENT') {
            console.warn('[RemovalTaskHandler] Failed to delete previous cache:', oldCachePath, err)
          }
        }
      }

      try {
        await this.removalService.refreshThumbnail(mediaId)
      } catch (error) {
        console.warn('[RemovalTaskHandler] Failed to refresh thumbnail:', error)
      }

      this.removalService.emitProgress({
        mediaId,
        operationId,
        phase: 'complete',
        message: 'Removal complete'
      })
      this.removalService.emitResult({
        mediaId,
        operationId,
        success: true
      })

      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.removalService.emitProgress({
        mediaId,
        operationId,
        phase: 'error',
        message
      })
      this.removalService.emitResult({
        mediaId,
        operationId,
        success: false,
        error: message
      })
      return { success: false, error: message }
    }
  }
}
