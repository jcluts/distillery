import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { Worker } from 'worker_threads'
import workerPath from './lama-worker?modulePath'
import type { WorkerResponse } from './lama-worker-contract'

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
  private worker: Worker | null = null
  private initPromise: Promise<void> | null = null

  private ensureWorker(): Worker {
    if (this.worker) {
      return this.worker
    }

    this.worker = new Worker(workerPath)
    this.worker.on('error', (error) => {
      console.error('[LamaInference] Worker error:', error)
      this.worker = null
      this.initPromise = null
    })
    this.worker.on('exit', (code) => {
      if (code !== 0) {
        console.warn(`[LamaInference] Worker exited with code ${code}`)
      }
      this.worker = null
      this.initPromise = null
    })

    return this.worker
  }

  async infer(
    imageBuffer: Buffer,
    maskBuffer: Buffer,
    width: number,
    height: number
  ): Promise<Buffer> {
    await this.ensureInitialized()

    const worker = this.ensureWorker()
    return await new Promise<Buffer>((resolve, reject) => {
      const onMessage = (msg: WorkerResponse): void => {
        if (msg.type === 'result') {
          cleanup()
          resolve(Buffer.from(msg.outputBuffer))
          return
        }

        if (msg.type === 'error') {
          cleanup()
          reject(new Error(msg.error))
        }
      }

      const onError = (error: Error): void => {
        cleanup()
        reject(error)
      }

      const cleanup = (): void => {
        worker.off('message', onMessage)
        worker.off('error', onError)
      }

      worker.on('message', onMessage)
      worker.on('error', onError)
      worker.postMessage({
        type: 'infer',
        imageBuffer: new Uint8Array(imageBuffer),
        maskBuffer: new Uint8Array(maskBuffer),
        width,
        height
      })
    })
  }

  async dispose(): Promise<void> {
    if (!this.worker) {
      return
    }

    const worker = this.worker
    this.worker = null
    this.initPromise = null
    await worker.terminate()
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

    const worker = this.ensureWorker()
    this.initPromise = new Promise<void>((resolve, reject) => {
      const onMessage = (msg: WorkerResponse): void => {
        if (msg.type === 'ready') {
          cleanup()
          resolve()
          return
        }

        if (msg.type === 'error') {
          cleanup()
          reject(new Error(msg.error))
        }
      }

      const onError = (error: Error): void => {
        cleanup()
        reject(error)
      }

      const cleanup = (): void => {
        worker.off('message', onMessage)
        worker.off('error', onError)
      }

      worker.on('message', onMessage)
      worker.on('error', onError)
      worker.postMessage({ type: 'init', modelPath })
    })

    try {
      await this.initPromise
    } catch (error) {
      this.initPromise = null
      throw error
    }
  }
}
