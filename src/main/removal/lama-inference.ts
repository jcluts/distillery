import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { Worker } from 'worker_threads'

interface ReadyMessage {
  type: 'ready'
}

interface ResultMessage {
  type: 'result'
  outputBuffer: Uint8Array
}

interface ErrorMessage {
  type: 'error'
  error: string
}

type WorkerResponse = ReadyMessage | ResultMessage | ErrorMessage

function getWorkerSource(): string {
  return `
const { parentPort } = require('worker_threads')
const ort = require('onnxruntime-node')

let session = null

function clamp01(value) {
  if (Number.isNaN(value)) return 0
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

async function initSession(modelPath) {
  if (session) return
  session = await ort.InferenceSession.create(modelPath, {
    executionProviders: ['cpu'],
    graphOptimizationLevel: 'all'
  })
}

function buildInputTensors(imageBuffer, maskBuffer, width, height) {
  const pixelCount = width * height
  const imageData = new Float32Array(pixelCount * 3)
  const maskData = new Float32Array(pixelCount)

  for (let i = 0; i < pixelCount; i += 1) {
    const base = i * 3
    const isHole = maskBuffer[i] > 0

    maskData[i] = isHole ? 1 : 0

    imageData[i] = isHole ? 0 : imageBuffer[base] / 255
    imageData[i + pixelCount] = isHole ? 0 : imageBuffer[base + 1] / 255
    imageData[i + pixelCount * 2] = isHole ? 0 : imageBuffer[base + 2] / 255
  }

  return {
    imageTensor: new ort.Tensor('float32', imageData, [1, 3, height, width]),
    maskTensor: new ort.Tensor('float32', maskData, [1, 1, height, width])
  }
}

function toRgbBuffer(output, width, height) {
  const pixelCount = width * height
  const data = output.data
  const rgb = Buffer.alloc(pixelCount * 3)

  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY

  for (let i = 0; i < data.length; i += 1) {
    const v = data[i]
    if (v < min) min = v
    if (v > max) max = v
  }

  const scale = max > 1.5 ? 1 / 255 : 1
  const shift = min < -0.05

  for (let i = 0; i < pixelCount; i += 1) {
    const rRaw = data[i] * scale
    const gRaw = data[i + pixelCount] * scale
    const bRaw = data[i + pixelCount * 2] * scale

    const r = clamp01(shift ? (rRaw + 1) / 2 : rRaw)
    const g = clamp01(shift ? (gRaw + 1) / 2 : gRaw)
    const b = clamp01(shift ? (bRaw + 1) / 2 : bRaw)

    const base = i * 3
    rgb[base] = Math.round(r * 255)
    rgb[base + 1] = Math.round(g * 255)
    rgb[base + 2] = Math.round(b * 255)
  }

  return rgb
}

async function runInference(message) {
  if (!session) {
    throw new Error('LaMa session is not initialized')
  }

  const imageBuffer = Buffer.from(message.imageBuffer)
  const maskBuffer = Buffer.from(message.maskBuffer)
  const { imageTensor, maskTensor } = buildInputTensors(imageBuffer, maskBuffer, message.width, message.height)

  const feeds = {}
  for (const inputName of session.inputNames) {
    const lower = inputName.toLowerCase()
    feeds[inputName] = lower.includes('mask') ? maskTensor : imageTensor
  }

  const outputs = await session.run(feeds)
  const outputName = session.outputNames[0]
  const output = outputs[outputName]
  if (!output) {
    throw new Error('LaMa inference output was empty')
  }

  return toRgbBuffer(output, message.width, message.height)
}

parentPort.on('message', async (message) => {
  try {
    if (message.type === 'init') {
      await initSession(message.modelPath)
      parentPort.postMessage({ type: 'ready' })
      return
    }

    if (message.type === 'infer') {
      const output = await runInference(message)
      parentPort.postMessage({ type: 'result', outputBuffer: output })
    }
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : String(error)
    parentPort.postMessage({ type: 'error', error: errMessage })
  }
})
`
}

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

    this.worker = new Worker(getWorkerSource(), { eval: true })
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
