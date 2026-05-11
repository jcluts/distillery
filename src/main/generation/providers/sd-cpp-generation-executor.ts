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

interface SdCppJobSubmitResponse {
  id?: string
  status?: string
  poll_url?: string
  error?: string
  message?: string
}

interface SdCppJobStatusResponse {
  id?: string
  status?: 'queued' | 'generating' | 'completed' | 'failed' | 'cancelled'
  result?: {
    output_format?: string
    images?: Array<{
      index?: number
      b64_json?: string
    }>
  } | null
  error?: {
    code?: string
    message?: string
  } | null
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

    const body = await this.buildRequestBody(request, asNumber(width), asNumber(height))
    const stopListening = this.serverManager.onProgress(({ step, totalSteps }) => {
      this.emitProgress(
        request.generationId,
        'generating',
        `Generating with stable-diffusion.cpp (${step}/${totalSteps})`,
        step,
        totalSteps
      )
    })

    let job: SdCppJobStatusResponse
    try {
      const response = await requestJson<SdCppJobSubmitResponse>(`${baseUrl}/sdcpp/v1/img_gen`, {
        method: 'POST',
        body,
        timeoutMs: 30_000
      })

      if (response.error) {
        return {
          success: false,
          outputs: [],
          error: response.message ?? response.error
        }
      }

      if (!response.id) {
        return {
          success: false,
          outputs: [],
          error: 'stable-diffusion.cpp did not return a job id'
        }
      }

      job = await this.pollJob(baseUrl, response.id, request.generationId)
    } finally {
      stopListening()
    }

    if (job.status === 'failed' || job.status === 'cancelled') {
      return {
        success: false,
        outputs: [],
        error:
          job.error?.message ??
          (job.status === 'cancelled'
            ? 'stable-diffusion.cpp generation was cancelled'
            : 'stable-diffusion.cpp generation failed')
      }
    }

    const images = Array.isArray(job.result?.images) ? job.result.images : []
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
      const image = images[index]
      if (!image?.b64_json) continue

      const outputPath =
        index === 0
          ? path.join(request.outputDir, `gen-${request.generationId}.png`)
          : path.join(request.outputDir, `gen-${request.generationId}-${index + 1}.png`)
      await fs.promises.writeFile(outputPath, decodeBase64Image(image.b64_json))
      outputs.push({ localPath: outputPath, mimeType: 'image/png' })
    }

    if (outputs.length === 0) {
      return {
        success: false,
        outputs: [],
        error: 'stable-diffusion.cpp returned empty image payloads'
      }
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
    height: number
  ): Promise<Record<string, unknown>> {
    const params = request.params
    const sampleMethod =
      typeof params.sampling_method === 'string' && params.sampling_method.trim()
        ? params.sampling_method
        : 'euler'

    const body: Record<string, unknown> = {
      prompt: asString(params.prompt),
      negative_prompt: '',
      width,
      height,
      strength: asOptionalNumber(params.strength) ?? 0.75,
      seed: asOptionalNumber(params.seed) ?? -1,
      batch_count: 1,
      auto_resize_ref_image: true,
      increase_ref_index: false,
      embed_image_metadata: true,
      output_format: 'png',
      output_compression: 100,
      sample_params: {
        sample_method: sampleMethod,
        sample_steps: asOptionalNumber(params.steps) ?? 4,
        guidance: {
          txt_cfg: 1.0,
          distilled_guidance: asOptionalNumber(params.guidance) ?? 3.5
        }
      }
    }

    if (request.refImagePaths.length > 0) {
      const images = await Promise.all(
        request.refImagePaths.map(async (imagePath) =>
          (await fs.promises.readFile(imagePath)).toString('base64')
        )
      )
      body.ref_images = images
    }

    return body
  }

  private async pollJob(
    baseUrl: string,
    jobId: string,
    generationId: string
  ): Promise<SdCppJobStatusResponse> {
    const deadline = Date.now() + 600_000
    let lastStatus: SdCppJobStatusResponse | null = null

    while (Date.now() < deadline) {
      const status = await requestJson<SdCppJobStatusResponse>(
        `${baseUrl}/sdcpp/v1/jobs/${encodeURIComponent(jobId)}`,
        {
          method: 'GET',
          timeoutMs: 5000
        }
      )

      lastStatus = status
      if (
        status.status === 'completed' ||
        status.status === 'failed' ||
        status.status === 'cancelled'
      ) {
        return status
      }

      if (status.status === 'queued') {
        this.emitProgress(generationId, 'queued', 'Queued in stable-diffusion.cpp')
      } else {
        this.emitProgress(generationId, 'generating', 'Generating with stable-diffusion.cpp')
      }

      await delay(1000)
    }

    throw new Error(
      `stable-diffusion.cpp job ${jobId} did not complete within 600s${
        lastStatus?.status ? ` (last status: ${lastStatus.status})` : ''
      }`
    )
  }

  private emitProgress(
    generationId: string,
    phase: string,
    message: string,
    step?: number,
    totalSteps?: number
  ): void {
    this.onProgress({
      generationId,
      providerId: 'local',
      phase,
      message,
      step,
      totalSteps
    })
  }
}

function decodeBase64Image(value: string): Buffer {
  const commaIndex = value.indexOf(',')
  const raw = commaIndex >= 0 ? value.slice(commaIndex + 1) : value
  return Buffer.from(raw, 'base64')
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
