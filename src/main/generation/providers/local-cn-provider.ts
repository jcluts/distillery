import { EventEmitter } from 'events'
import { EngineManager } from '../../engine/engine-manager'
import type { GenerationExecutionRequest, GenerationExecutionResult, GenerationProgressEvent } from '../../types'
import type { GenerationProvider } from './generation-provider'

export class LocalCnEngineProvider
  extends EventEmitter
  implements GenerationProvider
{
  id = 'local'
  mode: 'queued-local' = 'queued-local'

  private engineManager: EngineManager

  constructor(engineManager: EngineManager) {
    super()
    this.engineManager = engineManager

    this.engineManager.on('progress', (event) => {
      const progress: GenerationProgressEvent = {
        generationId: event.jobId,
        providerId: this.id,
        phase: event.phase,
        step: event.step,
        totalSteps: event.totalSteps,
        message: event.message
      }
      this.emit('progress', progress)
    })
  }

  async start(request: GenerationExecutionRequest): Promise<GenerationExecutionResult> {
    const outputPath = request.outputPath
    if (!outputPath) {
      return {
        generationId: request.generationId,
        success: false,
        error: 'Local provider missing output path'
      }
    }

    const params = request.params
    const result = await this.engineManager.generate({
      id: request.generationId,
      prompt: String(params.prompt ?? ''),
      width: Number(params.width ?? 1024),
      height: Number(params.height ?? 1024),
      seed: typeof params.seed === 'number' ? params.seed : -1,
      steps: typeof params.steps === 'number' ? params.steps : 4,
      guidance: typeof params.guidance === 'number' ? params.guidance : 3.5,
      sampling_method: typeof params.sampling_method === 'string' ? params.sampling_method : 'euler',
      ref_images: request.preparedInputs?.refImages ?? [],
      output: outputPath,
      use_prompt_cache: true,
      use_ref_latent_cache: true
    })

    if (!result.success) {
      return {
        generationId: request.generationId,
        success: false,
        error: result.error
      }
    }

    const providerPath = result.outputPath || outputPath

    return {
      generationId: request.generationId,
      success: true,
      outputs: [{ providerPath, mimeType: 'image/png' }],
      metrics: {
        seed: result.seed,
        totalTimeMs: result.totalTimeMs,
        promptCacheHit: result.promptCacheHit,
        refLatentCacheHit: result.refLatentCacheHit
      }
    }
  }
}
