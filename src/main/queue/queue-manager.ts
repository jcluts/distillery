import { EventEmitter } from 'events'
import { v4 as uuidv4 } from 'uuid'
import Database from 'better-sqlite3'
import { EngineManager } from '../engine/engine-manager'
import * as generationRepo from '../db/repositories/generations'
import * as queueRepo from '../db/repositories/queue'
import type {
  GenerationParams,
  GenerationRecord,
  QueueItem,
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
  private isProcessing = false

  constructor(db: Database.Database, engineManager: EngineManager) {
    super()
    this.db = db
    this.engineManager = engineManager

    // Listen for engine progress to forward to subscribers
    this.engineManager.on('progress', (event: EngineProgressEvent) => {
      this.emit('progress', event)
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

    // Create generation record
    const generation: GenerationRecord = {
      id: genId,
      number: generationRepo.getNextGenerationNumber(this.db),
      base_model_id: null, // TODO: resolve from loaded model
      provider: 'local',
      model_file: null,
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

      // TODO: Resolve output path via FileManager
      const outputPath = `temp_output_${item.generation_id}.png`

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
        output: outputPath,
        use_prompt_cache: true,
        use_ref_latent_cache: true
      })

      if (result.success) {
        // Update generation as completed
        generationRepo.updateGenerationComplete(this.db, item.generation_id, {
          status: 'completed',
          seed: result.seed,
          total_time_ms: result.totalTimeMs,
          prompt_cache_hit: result.promptCacheHit,
          ref_latent_cache_hit: result.refLatentCacheHit,
          output_paths: JSON.stringify([result.outputPath])
        })
        queueRepo.updateQueueStatus(this.db, item.id, 'completed')

        // TODO: Move output file via FileManager, generate thumbnail, create media record
        this.emit('result', result)
      } else {
        generationRepo.updateGenerationComplete(this.db, item.generation_id, {
          status: 'failed',
          error: result.error
        })
        queueRepo.updateQueueStatus(this.db, item.id, 'failed', result.error)
        this.emit('result', result)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      generationRepo.updateGenerationComplete(this.db, item.generation_id, {
        status: 'failed',
        error: message
      })
      queueRepo.updateQueueStatus(this.db, item.id, 'failed', message)
    } finally {
      this.isProcessing = false
      this.emit('updated')

      // Process next job
      this.processNext()
    }
  }
}
