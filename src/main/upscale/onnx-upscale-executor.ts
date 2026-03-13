import { performance } from 'perf_hooks'
import { OnnxUpscaleInference } from './onnx-upscale-inference'
import { preprocessUpscaleImage, writeOnnxUpscaleOutput } from './upscale-image-utils'
import type { BackendUpscaleExecuteArgs, BackendUpscaleResult } from './upscale-execution-types'

export class OnnxUpscaleExecutor {
  private readonly inference = new OnnxUpscaleInference()

  async execute(args: BackendUpscaleExecuteArgs): Promise<BackendUpscaleResult> {
    const input = await preprocessUpscaleImage(args.inputAbsPath)
    const start = performance.now()

    const result = await this.inference.upscale({
      modelPath: args.modelPath,
      imageData: input.data,
      width: input.width,
      height: input.height,
      scale: args.nativeScale,
      tileSize: args.tileSize ?? 512,
      onProgress: args.onProgress
    })

    const dimensions = await writeOnnxUpscaleOutput({
      data: result.data,
      sourceWidth: input.width,
      sourceHeight: input.height,
      outputWidth: result.width,
      outputHeight: result.height,
      outputPath: args.outputAbsPath,
      requestedScale: args.scaleFactor,
      nativeScale: args.nativeScale
    })

    return {
      width: dimensions.width,
      height: dimensions.height,
      totalTimeMs: Math.round(performance.now() - start)
    }
  }

  async dispose(): Promise<void> {
    await this.inference.dispose()
  }
}