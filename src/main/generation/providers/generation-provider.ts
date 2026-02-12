import type { GenerationExecutionRequest, GenerationExecutionResult } from '../../types'

export interface GenerationProvider {
  id: string
  mode: 'queued-local' | 'remote-async'
  start(request: GenerationExecutionRequest): Promise<GenerationExecutionResult>
}
