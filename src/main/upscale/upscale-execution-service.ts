import Database from 'better-sqlite3'
import * as settingsRepo from '../db/repositories/settings'
import { EngineManager } from '../engine/engine-manager'
import { CnEngineUpscaleExecutor } from './cn-engine-upscale-executor'
import { OnnxUpscaleExecutor } from './onnx-upscale-executor'
import { UpscaleModelService } from './upscale-model-service'
import type { UpscaleExecutionArgs, UpscaleExecutionResult } from './upscale-execution-types'

export class UpscaleExecutionService {
  private readonly cnEngineExecutor: CnEngineUpscaleExecutor
  private readonly onnxExecutor = new OnnxUpscaleExecutor()

  constructor(
    private readonly db: Database.Database,
    private readonly modelService: UpscaleModelService,
    engineManager: EngineManager
  ) {
    this.cnEngineExecutor = new CnEngineUpscaleExecutor(engineManager)
  }

  async execute(args: UpscaleExecutionArgs): Promise<UpscaleExecutionResult> {
    const backendPreference = settingsRepo.getSetting(this.db, 'upscale_backend')
    const resolvedModel = this.modelService.resolveExecutionModel(args.modelId, backendPreference)
    if (!resolvedModel) {
      throw new Error(`Upscale model not available for backend preference '${backendPreference}': ${args.modelId}`)
    }

    const executorArgs = {
      inputAbsPath: args.inputAbsPath,
      outputAbsPath: args.outputAbsPath,
      modelPath: resolvedModel.modelPath,
      nativeScale: resolvedModel.config.nativeScale,
      scaleFactor: args.scaleFactor,
      variantId: args.variantId,
      mediaWidth: args.media.width,
      mediaHeight: args.media.height,
      tileSize: resolvedModel.artifact.tileSize,
      onProgress: args.onProgress
    }

    const result =
      resolvedModel.backend === 'onnx'
        ? await this.onnxExecutor.execute(executorArgs)
        : await this.cnEngineExecutor.execute(executorArgs)

    return {
      ...result,
      backend: resolvedModel.backend,
      modelConfig: resolvedModel.config
    }
  }
}