import type { GenerationExecutionRequest, GenerationExecutionResult } from '../../types'
import type { GenerationProvider } from './generation-provider'

export class RemoteApiProvider implements GenerationProvider {
  id = 'remote-api'
  mode: 'remote-async' = 'remote-async'

  async start(request: GenerationExecutionRequest): Promise<GenerationExecutionResult> {
    return {
      generationId: request.generationId,
      success: false,
      error: 'Remote async generation is not implemented yet'
    }
  }
}
