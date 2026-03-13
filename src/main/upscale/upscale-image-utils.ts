import * as fs from 'fs'
import sharp from 'sharp'

export async function preprocessUpscaleImage(
  imagePath: string
): Promise<{ data: Float32Array; width: number; height: number }> {
  const image = sharp(imagePath)
  const metadata = await image.metadata()

  const width = metadata.width ?? 0
  const height = metadata.height ?? 0
  if (width <= 0 || height <= 0) {
    throw new Error('Invalid image dimensions')
  }

  const { data: pixels } = await image.removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const floatData = new Float32Array(width * height * 3)

  for (let channel = 0; channel < 3; channel += 1) {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const srcIndex = (y * width + x) * 3 + channel
        const dstIndex = channel * width * height + y * width + x
        floatData[dstIndex] = pixels[srcIndex] / 255
      }
    }
  }

  return { data: floatData, width, height }
}

export async function writeOnnxUpscaleOutput(args: {
  data: Float32Array
  sourceWidth: number
  sourceHeight: number
  outputWidth: number
  outputHeight: number
  outputPath: string
  requestedScale: number
  nativeScale: number
}): Promise<{ width: number; height: number }> {
  const pixels = Buffer.alloc(args.outputWidth * args.outputHeight * 3)

  for (let channel = 0; channel < 3; channel += 1) {
    for (let y = 0; y < args.outputHeight; y += 1) {
      for (let x = 0; x < args.outputWidth; x += 1) {
        const srcIndex = channel * args.outputWidth * args.outputHeight + y * args.outputWidth + x
        const dstIndex = (y * args.outputWidth + x) * 3 + channel
        const value = Math.max(0, Math.min(1, args.data[srcIndex]))
        pixels[dstIndex] = Math.round(value * 255)
      }
    }
  }

  let image = sharp(pixels, {
    raw: {
      width: args.outputWidth,
      height: args.outputHeight,
      channels: 3
    }
  })

  let finalWidth = args.outputWidth
  let finalHeight = args.outputHeight

  if (args.requestedScale < args.nativeScale) {
    finalWidth = Math.round(args.sourceWidth * args.requestedScale)
    finalHeight = Math.round(args.sourceHeight * args.requestedScale)
    image = image.resize(finalWidth, finalHeight, { kernel: sharp.kernel.lanczos3 })
  }

  await image.png().toFile(args.outputPath)
  return { width: finalWidth, height: finalHeight }
}

export async function finalizeExistingUpscaleOutput(args: {
  outputPath: string
  requestedScale: number
  nativeScale: number
  sourceWidth?: number | null
  sourceHeight?: number | null
}): Promise<{ width: number; height: number }> {
  const sourceWidth = args.sourceWidth ?? 0
  const sourceHeight = args.sourceHeight ?? 0

  if (args.requestedScale < args.nativeScale && sourceWidth > 0 && sourceHeight > 0) {
    const targetWidth = Math.round(sourceWidth * args.requestedScale)
    const targetHeight = Math.round(sourceHeight * args.requestedScale)
    const tempPath = `${args.outputPath}.tmp`

    await sharp(args.outputPath)
      .resize(targetWidth, targetHeight, { kernel: sharp.kernel.lanczos3 })
      .png()
      .toFile(tempPath)

    await fs.promises.rename(tempPath, args.outputPath)
    return { width: targetWidth, height: targetHeight }
  }

  const metadata = await sharp(args.outputPath).metadata()
  return {
    width: metadata.width ?? 0,
    height: metadata.height ?? 0
  }
}