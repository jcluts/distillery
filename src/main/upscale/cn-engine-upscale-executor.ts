import { EngineManager } from '../engine/engine-manager'
import { finalizeExistingUpscaleOutput } from './upscale-image-utils'
import type { BackendUpscaleExecuteArgs, BackendUpscaleResult } from './upscale-execution-types'

export class CnEngineUpscaleExecutor {
  constructor(private readonly engineManager: EngineManager) {}

  async execute(args: BackendUpscaleExecuteArgs): Promise<BackendUpscaleResult> {
    const jobId = `upscale-${args.variantId}`
    const progressListener = (event: {
      jobId: string
      step?: number
      totalSteps?: number
      message?: string
    }): void => {
      if (event.jobId !== jobId) {
        return
      }

      args.onProgress?.({
        step: event.step,
        totalSteps: event.totalSteps,
        message: event.message
      })
    }

    this.engineManager.on('progress', progressListener)

    let result: { success: boolean; totalTimeMs?: number; error?: string }
    try {
      result = await this.engineManager.upscale({
        id: jobId,
        input: args.inputAbsPath,
        output: args.outputAbsPath,
        upscale_model: args.modelPath,
        upscale_repeats: 1
      })
    } finally {
      this.engineManager.off('progress', progressListener)
    }

    if (!result.success) {
      throw new Error(result.error ?? 'cn-engine upscale failed')
    }

    const dimensions = await finalizeExistingUpscaleOutput({
      outputPath: args.outputAbsPath,
      requestedScale: args.scaleFactor,
      nativeScale: args.nativeScale,
      sourceWidth: args.mediaWidth,
      sourceHeight: args.mediaHeight
    })

    return {
      width: dimensions.width,
      height: dimensions.height,
      totalTimeMs: result.totalTimeMs
    }
  }
}