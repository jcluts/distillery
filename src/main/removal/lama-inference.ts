import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import workerPath from './lama-worker?modulePath'
import { OnnxWorkerClient } from '../onnx/worker-client'
import type {
  InitMessage,
  ResultMessage,
  WorkerMessage,
  WorkerResponse
} from './lama-worker-contract'

function getResourcesRoot(): string {
  return app.isPackaged ? process.resourcesPath : path.join(app.getAppPath(), 'resources')
}

function resolveModelPath(): string {
  const envPath = process.env.DISTILLERY_LAMA_MODEL_PATH
  if (envPath && fs.existsSync(envPath)) {
    return envPath
  }

  return path.join(getResourcesRoot(), 'models', 'inpainting', 'lama.onnx')
}

export class LamaInference {
  private client = new OnnxWorkerClient<WorkerMessage, WorkerResponse>(workerPath, 'LamaInference')
  private initPromise: Promise<void> | null = null

  async infer(
    imageBuffer: Buffer,
    maskBuffer: Buffer,
    width: number,
    height: number
  ): Promise<Buffer> {
    await this.ensureInitialized()

    const imageData = new Uint8Array(imageBuffer)
    const maskData = new Uint8Array(maskBuffer)
    const result = await this.client.sendRequest(
      {
        type: 'infer',
        imageBuffer: imageData,
        maskBuffer: maskData,
        width,
        height
      },
      {
        isFinal: (msg) => msg.type === 'result',
        transferList: [imageData.buffer, maskData.buffer]
      }
    )

    return Buffer.from((result as ResultMessage).outputBuffer)
  }

  async dispose(): Promise<void> {
    this.initPromise = null
    await this.client.dispose()
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initPromise) {
      await this.initPromise
      return
    }

    const modelPath = resolveModelPath()
    if (!fs.existsSync(modelPath)) {
      throw new Error(`LaMa model file not found: ${modelPath}`)
    }

    this.initPromise = this.client
      .sendRequest({ type: 'init', modelPath } satisfies Omit<InitMessage, 'requestId'>, {
        isFinal: (msg) => msg.type === 'ready'
      })
      .then(() => undefined)

    try {
      await this.initPromise
    } catch (error) {
      this.initPromise = null
      throw error
    }
  }
}
