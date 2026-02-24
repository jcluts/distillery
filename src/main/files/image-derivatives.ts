// =============================================================================
// Image Derivatives
// Uses sharp for generating thumbnails and normalized reference images.
// =============================================================================

import sharp from 'sharp'
import { join } from 'path'
import { existsSync } from 'fs'
import type { ImageTransforms } from '../types'
import { applyTransforms, getTransformedDimensions } from './transform-pipeline'

export const THUMBNAIL_SIZE = 400
export const THUMBNAIL_QUALITY = 80
export const REFERENCE_IMAGE_MAX_PIXELS = 1024 * 1024

/**
 * Generate a square-cropped JPEG thumbnail.
 *
 * @param sourcePath - Path to the source image
 * @param outputDir - Directory to write the thumbnail to
 * @param filename - Output filename (without extension)
 * @returns Path to the generated thumbnail, or null on failure
 */
export async function createThumbnail(
  sourcePath: string,
  outputDir: string,
  filename: string
): Promise<string | null> {
  const outputPath = join(outputDir, `${filename}_thumb.jpg`)

  if (existsSync(outputPath)) {
    return outputPath
  }

  try {
    await sharp(sourcePath)
      .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, {
        fit: 'cover',
        position: 'centre'
      })
      .jpeg({ quality: THUMBNAIL_QUALITY })
      .toFile(outputPath)

    return outputPath
  } catch (err) {
    console.error(`[ImageDerivatives] Failed to generate thumbnail: ${err}`)
    return null
  }
}

/**
 * Regenerate and overwrite a media thumbnail with optional transforms applied.
 */
export async function regenerateThumbnail(
  sourcePath: string,
  outputPath: string,
  transforms: ImageTransforms | null
): Promise<void> {
  const metadata = await sharp(sourcePath).metadata()
  const width = metadata.width ?? 0
  const height = metadata.height ?? 0

  if (width <= 0 || height <= 0) {
    throw new Error(`Invalid image dimensions for ${sourcePath}`)
  }

  let pipeline = sharp(sourcePath)
  pipeline = applyTransforms(pipeline, transforms, width, height)

  await pipeline
    .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, {
      fit: 'cover',
      position: 'centre'
    })
    .jpeg({ quality: THUMBNAIL_QUALITY })
    .toFile(outputPath)
}

/**
 * Downscale an image to fit within a max pixel count (e.g., 1MP for reference images).
 *
 * @param sourcePath - Path to the source image
 * @param outputPath - Path to write the downscaled image
 * @param maxPixels - Maximum total pixels (default 1024*1024)
 */
export async function createReferenceImageDerivative(
  sourcePath: string,
  outputPath: string,
  maxPixels = REFERENCE_IMAGE_MAX_PIXELS,
  transforms: ImageTransforms | null = null
): Promise<void> {
  const metadata = await sharp(sourcePath).metadata()
  const width = metadata.width ?? 0
  const height = metadata.height ?? 0

  if (width <= 0 || height <= 0) {
    throw new Error(`Invalid image dimensions for ${sourcePath}`)
  }

  const transformed = getTransformedDimensions(width, height, transforms)
  const pixels = transformed.width * transformed.height

  // Flux2 VAE ref-image encode path requires dimensions aligned to 16
  // (VAE scale factor 8 plus Flux2 pack factor 2).
  const ALIGN = 16
  const alignDown = (value: number): number => {
    if (value <= ALIGN) return ALIGN
    return Math.max(ALIGN, Math.floor(value / ALIGN) * ALIGN)
  }

  const scale = pixels > maxPixels ? Math.sqrt(maxPixels / pixels) : 1
  const scaledWidth = Math.max(ALIGN, Math.round(transformed.width * scale))
  const scaledHeight = Math.max(ALIGN, Math.round(transformed.height * scale))

  const targetWidth = alignDown(scaledWidth)
  const targetHeight = alignDown(scaledHeight)

  if (targetWidth !== transformed.width || targetHeight !== transformed.height) {
    const reasons: string[] = []
    if (scale < 1) {
      reasons.push(`pixel budget ${maxPixels}`)
    }
    if (targetWidth !== scaledWidth || targetHeight !== scaledHeight) {
      reasons.push(`alignment ${ALIGN}`)
    }

    console.info(
      `[ImageDerivatives] Resized reference image ${transformed.width}x${transformed.height} -> ${targetWidth}x${targetHeight} (${reasons.join(', ')}) source=${sourcePath}`
    )
  }

  let pipeline = sharp(sourcePath).rotate()
  pipeline = applyTransforms(pipeline, transforms, width, height)

  await pipeline.resize(targetWidth, targetHeight, {
      fit: 'cover',
      position: 'centre'
    })
    .removeAlpha()
    .toColourspace('srgb')
    .png()
    .toFile(outputPath)
}
