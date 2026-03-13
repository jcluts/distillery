import * as ort from 'onnxruntime-node'
import { parentPort } from 'worker_threads'
import { performance } from 'perf_hooks'
import { createOnnxSession, disposeOnnxSession } from '../onnx/runtime'
import type {
  ProgressMessage,
  ResultMessage,
  WorkerMessage,
  WorkerResponse
} from './onnx-upscale-worker-contract'

let session: ort.InferenceSession | null = null
let currentModelPath: string | null = null

function respond(message: WorkerResponse): void {
  parentPort?.postMessage(message)
}

async function initializeModel(modelPath: string): Promise<void> {
  if (session && currentModelPath === modelPath) {
    return
  }

  await disposeOnnxSession(session)
  session = await createOnnxSession(modelPath)
  currentModelPath = modelPath
}

function getFixedInputSize(): { width: number; height: number } | null {
  if (!session) {
    return null
  }

  const inputName = session.inputNames[0]
  const metadataSource = session as ort.InferenceSession & {
    inputMetadata?: Record<string, { dimensions?: Array<number | string> }>
  }
  const metadata = metadataSource.inputMetadata?.[inputName]
  const dims = metadata?.dimensions
  if (!dims || dims.length < 4) {
    return null
  }

  const height = Number(dims[2])
  const width = Number(dims[3])
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null
  }

  return { width, height }
}

async function processTile(
  data: Float32Array,
  width: number,
  height: number,
  scale: number
): Promise<{ data: Float32Array; width: number; height: number }> {
  if (!session) {
    throw new Error('ONNX upscale session is not initialized')
  }

  const inputTensor = new ort.Tensor('float32', data, [1, 3, height, width])
  const inputName = session.inputNames[0]
  const outputName = session.outputNames[0]

  const start = performance.now()
  const results = await session.run({ [inputName]: inputTensor })
  const outputTensor = results[outputName]
  console.log(`[OnnxUpscaleWorker] Tile ${width}x${height} inference: ${(performance.now() - start).toFixed(0)}ms`)

  return {
    data: outputTensor.data as Float32Array,
    width: width * scale,
    height: height * scale
  }
}

function extractTile(
  data: Float32Array,
  sourceWidth: number,
  sourceHeight: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number
): Float32Array {
  const tileWidth = x1 - x0
  const tileHeight = y1 - y0
  const tile = new Float32Array(tileWidth * tileHeight * 3)

  for (let channel = 0; channel < 3; channel += 1) {
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const srcIndex = channel * sourceWidth * sourceHeight + y * sourceWidth + x
        const dstIndex = channel * tileWidth * tileHeight + (y - y0) * tileWidth + (x - x0)
        tile[dstIndex] = data[srcIndex]
      }
    }
  }

  return tile
}

function placeTile(
  output: Float32Array,
  outputWidth: number,
  outputHeight: number,
  tileData: Float32Array,
  tileWidth: number,
  tileHeight: number,
  x0: number,
  y0: number
): void {
  for (let channel = 0; channel < 3; channel += 1) {
    for (let y = 0; y < tileHeight; y += 1) {
      for (let x = 0; x < tileWidth; x += 1) {
        const outputX = x0 + x
        const outputY = y0 + y
        if (outputX >= outputWidth || outputY >= outputHeight) {
          continue
        }

        const srcIndex = channel * tileWidth * tileHeight + y * tileWidth + x
        const dstIndex = channel * outputWidth * outputHeight + outputY * outputWidth + outputX
        output[dstIndex] = tileData[srcIndex]
      }
    }
  }
}

function padTile(
  data: Float32Array,
  width: number,
  height: number,
  targetWidth: number,
  targetHeight: number
): Float32Array {
  const padded = new Float32Array(targetWidth * targetHeight * 3)

  for (let channel = 0; channel < 3; channel += 1) {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const srcIndex = channel * width * height + y * width + x
        const dstIndex = channel * targetWidth * targetHeight + y * targetWidth + x
        padded[dstIndex] = data[srcIndex]
      }
    }
  }

  return padded
}

function cropTile(
  data: Float32Array,
  width: number,
  height: number,
  cropWidth: number,
  cropHeight: number
): Float32Array {
  if (width === cropWidth && height === cropHeight) {
    return data
  }

  const cropped = new Float32Array(cropWidth * cropHeight * 3)

  for (let channel = 0; channel < 3; channel += 1) {
    for (let y = 0; y < cropHeight; y += 1) {
      for (let x = 0; x < cropWidth; x += 1) {
        const srcIndex = channel * width * height + y * width + x
        const dstIndex = channel * cropWidth * cropHeight + y * cropWidth + x
        cropped[dstIndex] = data[srcIndex]
      }
    }
  }

  return cropped
}

async function processTileWithPadding(
  data: Float32Array,
  width: number,
  height: number,
  scale: number,
  fixedInput: { width: number; height: number } | null
): Promise<{ data: Float32Array; width: number; height: number }> {
  if (!fixedInput || (width === fixedInput.width && height === fixedInput.height)) {
    return await processTile(data, width, height, scale)
  }

  const padded = padTile(data, width, height, fixedInput.width, fixedInput.height)
  const result = await processTile(padded, fixedInput.width, fixedInput.height, scale)

  return {
    data: cropTile(result.data, result.width, result.height, width * scale, height * scale),
    width: width * scale,
    height: height * scale
  }
}

async function processTiled(
  data: Float32Array,
  width: number,
  height: number,
  tileSize: number,
  scale: number,
  fixedInput: { width: number; height: number } | null,
  requestId: number
): Promise<{ data: Float32Array; width: number; height: number }> {
  const overlap = 16
  const effectiveTile = Math.max(1, tileSize - overlap * 2)
  const tilesX = Math.ceil(width / effectiveTile)
  const tilesY = Math.ceil(height / effectiveTile)
  const totalTiles = tilesX * tilesY

  const outputWidth = width * scale
  const outputHeight = height * scale
  const output = new Float32Array(outputWidth * outputHeight * 3)

  let completedTiles = 0

  for (let tileY = 0; tileY < tilesY; tileY += 1) {
    for (let tileX = 0; tileX < tilesX; tileX += 1) {
      const x0 = Math.max(0, tileX * effectiveTile - overlap)
      const y0 = Math.max(0, tileY * effectiveTile - overlap)
      const x1 = Math.min(width, x0 + tileSize)
      const y1 = Math.min(height, y0 + tileSize)

      const tileData = extractTile(data, width, height, x0, y0, x1, y1)
      const tileWidth = x1 - x0
      const tileHeight = y1 - y0
      const tileResult = await processTileWithPadding(tileData, tileWidth, tileHeight, scale, fixedInput)

      placeTile(
        output,
        outputWidth,
        outputHeight,
        tileResult.data,
        tileResult.width,
        tileResult.height,
        x0 * scale,
        y0 * scale
      )

      completedTiles += 1
      const progress: ProgressMessage = {
        type: 'progress',
        requestId,
        completedTiles,
        totalTiles,
        message: `Processing tile ${completedTiles}/${totalTiles}`
      }
      respond(progress)
    }
  }

  return { data: output, width: outputWidth, height: outputHeight }
}

parentPort?.on('message', async (message: WorkerMessage) => {
  try {
    if (message.type === 'init') {
      await initializeModel(message.modelPath)
      respond({ type: 'ready', requestId: message.requestId })
      return
    }

    if (!session) {
      throw new Error('ONNX upscale session is not initialized')
    }

    const fixedInput = getFixedInputSize()
    const effectiveTileSize = fixedInput ? fixedInput.width : message.tileSize
    const result =
      message.width <= effectiveTileSize && message.height <= effectiveTileSize
        ? await processTileWithPadding(
            message.imageData,
            message.width,
            message.height,
            message.scale,
            fixedInput
          )
        : await processTiled(
            message.imageData,
            message.width,
            message.height,
            effectiveTileSize,
            message.scale,
            fixedInput,
            message.requestId
          )

    const response: ResultMessage = {
      type: 'result',
      requestId: message.requestId,
      data: result.data,
      width: result.width,
      height: result.height
    }
    respond(response)
  } catch (error) {
    respond({
      type: 'error',
      requestId: message.requestId,
      error: error instanceof Error ? error.message : String(error)
    })
  }
})