import workerPath from './onnx-upscale-worker?modulePath'
import { OnnxWorkerClient } from '../onnx/worker-client'
import type {
  InitMessage,
  ResultMessage,
  WorkerMessage,
  WorkerResponse
} from './onnx-upscale-worker-contract'
import type { UpscaleExecutionProgress } from './upscale-execution-types'

export class OnnxUpscaleInference {
  private client = new OnnxWorkerClient<WorkerMessage, WorkerResponse>(workerPath, 'OnnxUpscale')
  private currentModelPath: string | null = null
  private initPromise: Promise<void> | null = null

  async upscale(args: {
    modelPath: string
    imageData: Float32Array
    width: number
    height: number
    scale: number
    tileSize: number
    onProgress?: (progress: UpscaleExecutionProgress) => void
  }): Promise<{ data: Float32Array; width: number; height: number }> {
    await this.ensureInitialized(args.modelPath)

    const result = await this.client.sendRequest(
      {
        type: 'upscale',
        imageData: args.imageData,
        width: args.width,
        height: args.height,
        scale: args.scale,
        tileSize: args.tileSize
      },
      {
        isFinal: (message) => message.type === 'result',
        onResponse: (message) => {
          if (message.type === 'progress') {
            args.onProgress?.({
              step: message.completedTiles,
              totalSteps: message.totalTiles,
              message: message.message
            })
          }
        },
        transferList: [args.imageData.buffer as ArrayBuffer]
      }
    )

    return {
      data: (result as ResultMessage).data,
      width: (result as ResultMessage).width,
      height: (result as ResultMessage).height
    }
  }

  async dispose(): Promise<void> {
    this.currentModelPath = null
    this.initPromise = null
    await this.client.dispose()
  }

  private async ensureInitialized(modelPath: string): Promise<void> {
    if (this.currentModelPath === modelPath && !this.initPromise) {
      return
    }

    if (this.initPromise) {
      await this.initPromise
      if (this.currentModelPath === modelPath) {
        return
      }
    }

    this.initPromise = this.client
      .sendRequest(
        { type: 'init', modelPath } satisfies Omit<InitMessage, 'requestId'>,
        {
          isFinal: (message) => message.type === 'ready'
        }
      )
      .then(() => {
        this.currentModelPath = modelPath
      })

    try {
      await this.initPromise
    } finally {
      this.initPromise = null
    }
  }
}