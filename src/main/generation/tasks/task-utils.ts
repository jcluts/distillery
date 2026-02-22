import Database from 'better-sqlite3'
import type {
  CanonicalGenerationParams,
  GenerationExecutionResult,
  WorkItem,
  WorkTaskResult
} from '../../types'
import * as generationRepo from '../../db/repositories/generations'
import type { GenerationIOService } from '../generation-io-service'
import type { GenerationService } from '../generation-service'

// ---------------------------------------------------------------------------
// Payload parsing
// ---------------------------------------------------------------------------

export interface TaskPayload {
  generationId: string
  endpointKey: string
  params: CanonicalGenerationParams
}

/**
 * Parse and validate a work item's JSON payload. Throws on invalid data.
 */
export function parseTaskPayload(item: WorkItem): TaskPayload {
  let raw: unknown
  try {
    raw = JSON.parse(item.payload_json)
  } catch {
    throw new Error('Invalid payload_json for generation task')
  }

  const payload = raw as Partial<TaskPayload>
  if (
    !payload.generationId ||
    !payload.endpointKey ||
    !payload.params ||
    typeof payload.params !== 'object'
  ) {
    throw new Error('Malformed payload: requires generationId, endpointKey, and params')
  }

  return payload as TaskPayload
}

// ---------------------------------------------------------------------------
// Finalize + notify
// ---------------------------------------------------------------------------

/**
 * Finalize a generation result (ingest output files, update DB) and push
 * events to the renderer via GenerationService.
 */
export async function finalizeAndNotify(
  ioService: GenerationIOService,
  genService: GenerationService,
  result: GenerationExecutionResult
): Promise<WorkTaskResult> {
  const mediaRecords = await ioService.finalize(result)
  genService.emitResult(result)
  if (mediaRecords.length > 0) genService.emitLibraryUpdated()
  return { success: result.success, error: result.error }
}

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

/**
 * Mark a generation as failed, emit the error event, and return a
 * failed WorkTaskResult. Use this in task handler catch blocks.
 */
export function handleTaskFailure(
  db: Database.Database,
  genService: GenerationService,
  generationId: string,
  error: unknown
): WorkTaskResult {
  const message = error instanceof Error ? error.message : String(error)

  generationRepo.updateGenerationComplete(db, generationId, {
    status: 'failed',
    error: message
  })

  genService.emitResult({ generationId, success: false, error: message })

  return { success: false, error: message }
}
