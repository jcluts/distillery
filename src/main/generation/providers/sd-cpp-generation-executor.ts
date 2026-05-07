import * as fs from 'fs'
import * as path from 'path'
import { performance } from 'perf_hooks'
import type Database from 'better-sqlite3'
import * as settingsRepo from '../../db/repositories/settings'
import type { ModelCatalogService } from '../../models/model-catalog-service'
import { ModelResolver } from '../../models/model-resolver'
import type { GenerationProgressEvent } from '../../types'
import { asNumber, asOptionalNumber, asString, extractDimensions } from '../param-utils'
import type { GenerationRequest, GenerationResult } from './types'
import { requestJson, SdCppServerManager } from './sd-cpp-server-manager'

interface SdCppGenerationExecutorArgs {
  db: Database.Database
  modelCatalogService: ModelCatalogService
  serverManager: SdCppServerManager
  onProgress: (event: GenerationProgressEvent) => void
}

interface SdApiImageResponse {
  images?: string[]
  error?: string
  message?: string
}

export class SdCppGenerationExecutor {
  private readonly db: Database.Database
  private readonly modelCatalogService: ModelCatalogService
  private readonly serverManager: SdCppServerManager
  private readonly onProgress: (event: GenerationProgressEvent) => void

  constructor(args: SdCppGenerationExecutorArgs) {
    this.db = args.db
    this.modelCatalogService = args.modelCatalogService
    this.serverManager = args.serverManager
    this.onProgress = args.onProgress
  }

  async prepare(request: GenerationRequest): Promise<void> {
    await this.ensureServer(request)
  }

  async execute(request: GenerationRequest): Promise<GenerationResult> {
    const start = performance.now()
    const baseUrl = await this.ensureServer(request)

    const { width, height } = extractDimensions(request.params)
    if (!width || width <= 0) {
      throw new Error('Width must be a positive number')
    }
    if (!height || height <= 0) {
      throw new Error('Height must be a positive number')
    }

    await fs.promises.mkdir(request.outputDir, { recursive: true })

    this.emitProgress(request.generationId, 'generating', 'Generating with stable-diffusion.cpp')

    const img2img = request.refImagePaths.length > 0
    const body = await this.buildRequestBody(request, asNumber(width), asNumber(height), img2img)
    const endpoint = img2img ? '/sdapi/v1/img2img' : '/sdapi/v1/txt2img'
    const response = await requestJson<SdApiImageResponse>(`${baseUrl}${endpoint}`, {
      method: 'POST',
      body,
      timeoutMs: 600_000
    })

    if (response.error) {
      return {
        success: false,
        outputs: [],
        error: response.message ?? response.error
      }
    }

    const images = Array.isArray(response.images) ? response.images : []
    if (images.length === 0) {
      return {
        success: false,
        outputs: [],
        error: 'stable-diffusion.cpp returned no images'
      }
    }

    this.emitProgress(request.generationId, 'saving', 'Saving stable-diffusion.cpp output')

    const outputs: Array<{ localPath: string; mimeType?: string }> = []
    for (let index = 0; index < images.length; index++) {
      const outputPath =
        index === 0
          ? path.join(request.outputDir, `gen-${request.generationId}.png`)
          : path.join(request.outputDir, `gen-${request.generationId}-${index + 1}.png`)
      await fs.promises.writeFile(outputPath, decodeBase64Image(images[index]))
      outputs.push({ localPath: outputPath, mimeType: 'image/png' })
    }

    return {
      success: true,
      outputs,
      metrics: {
        seed: asOptionalNumber(request.params.seed) ?? undefined,
        totalTimeMs: Math.round(performance.now() - start)
      }
    }
  }

  async stop(): Promise<void> {
    await this.serverManager.stop()
  }

  private async ensureServer(request: GenerationRequest): Promise<string> {
    this.emitProgress(
      request.generationId,
      'starting',
      'Starting stable-diffusion.cpp and loading the selected model'
    )

    const settings = settingsRepo.getAllSettings(this.db)
    const catalog = this.modelCatalogService.loadCatalog()
    const resolver = new ModelResolver(catalog, settings)
    const modelId = request.endpoint.providerModelId

    if (!resolver.isModelReady(modelId)) {
      throw new Error(
        'Required model files are not downloaded. Open the Model Manager to set up the model.'
      )
    }

    if (!settings.sd_cpp_server_path.trim()) {
      throw new Error('stable-diffusion.cpp server path is not configured')
    }

    await fs.promises.access(settings.sd_cpp_server_path, fs.constants.X_OK)

    const paths = resolver.getModelPaths(modelId)
    return await this.serverManager.ensureRunning({
      serverPath: settings.sd_cpp_server_path,
      diffusionModel: paths.diffusion_model,
      vae: paths.vae,
      llm: paths.llm,
      offloadToCpu: settings.offload_to_cpu,
      flashAttention: settings.flash_attn,
      vaeOnCpu: settings.vae_on_cpu
    })
  }

  private async buildRequestBody(
    request: GenerationRequest,
    width: number,
    height: number,
    img2img: boolean
  ): Promise<Record<string, unknown>> {
    const params = request.params
    const body: Record<string, unknown> = {
      prompt: asString(params.prompt),
      width,
      height,
      steps: asOptionalNumber(params.steps) ?? 4,
      seed: asOptionalNumber(params.seed) ?? -1,
      cfg_scale: asOptionalNumber(params.guidance) ?? 1.0,
      sampler_name: typeof params.sampling_method === 'string' ? params.sampling_method : 'euler',
      batch_size: 1
    }

    if (img2img) {
      const images = await Promise.all(
        request.refImagePaths.map(async (imagePath) =>
          (await fs.promises.readFile(imagePath)).toString('base64')
        )
      )
      body.init_images = [images[0]]
      body.extra_images = images
      body.denoising_strength = asOptionalNumber(params.strength) ?? 0.75
    }

    return body
  }

  private emitProgress(generationId: string, phase: string, message: string): void {
    this.onProgress({
      generationId,
      providerId: 'local',
      phase,
      message
    })
  }
}

function decodeBase64Image(value: string): Buffer {
  const commaIndex = value.indexOf(',')
  const raw = commaIndex >= 0 ? value.slice(commaIndex + 1) : value
  return Buffer.from(raw, 'base64')
}
