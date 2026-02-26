import { parentPort } from 'worker_threads'
import * as ort from 'onnxruntime-node'

interface InitMessage {
  type: 'init'
  modelPath: string
}

interface InferMessage {
  type: 'infer'
  imageBuffer: Uint8Array
  maskBuffer: Uint8Array
  width: number
  height: number
}

type WorkerMessage = InitMessage | InferMessage

let session: ort.InferenceSession | null = null

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

async function initSession(modelPath: string): Promise<void> {
  if (session) {
    return
  }

  session = await ort.InferenceSession.create(modelPath, {
    executionProviders: ['cpu'],
    graphOptimizationLevel: 'all'
  })
}

function buildInputTensors(
  imageBuffer: Buffer,
  maskBuffer: Buffer,
  width: number,
  height: number
): { imageTensor: ort.Tensor; maskTensor: ort.Tensor } {
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

function toRgbBuffer(output: ort.Tensor, width: number, height: number): Buffer {
  const pixelCount = width * height
  const data = output.data as Float32Array | Uint8Array
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

async function runInference(msg: InferMessage): Promise<Buffer> {
  if (!session) {
    throw new Error('LaMa session is not initialized')
  }

  const imageBuffer = Buffer.from(msg.imageBuffer)
  const maskBuffer = Buffer.from(msg.maskBuffer)
  const { imageTensor, maskTensor } = buildInputTensors(imageBuffer, maskBuffer, msg.width, msg.height)

  const feeds: Record<string, ort.Tensor> = {}
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

  return toRgbBuffer(output, msg.width, msg.height)
}

parentPort?.on('message', async (msg: WorkerMessage) => {
  try {
    if (msg.type === 'init') {
      await initSession(msg.modelPath)
      parentPort?.postMessage({ type: 'ready' })
      return
    }

    if (msg.type === 'infer') {
      const output = await runInference(msg)
      parentPort?.postMessage({ type: 'result', outputBuffer: output })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    parentPort?.postMessage({ type: 'error', error: message })
  }
})
