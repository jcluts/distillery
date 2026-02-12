// =============================================================================
// Thumbnail Service
// Uses sharp for generating square-cropped JPEG thumbnails.
// =============================================================================

// NOTE: Implementation will be added when wiring up the full pipeline.
// For scaffolding, this establishes the module boundary.

import sharp from 'sharp'
import { join } from 'path'
import { existsSync } from 'fs'

const THUMBNAIL_SIZE = 400
const THUMBNAIL_QUALITY = 80

/**
 * Generate a square-cropped JPEG thumbnail.
 *
 * @param sourcePath - Path to the source image
 * @param outputDir - Directory to write the thumbnail to
 * @param filename - Output filename (without extension)
 * @returns Path to the generated thumbnail, or null on failure
 */
export async function generateThumbnail(
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
    console.error(`[ThumbnailService] Failed to generate thumbnail: ${err}`)
    return null
  }
}

/**
 * Downscale an image to fit within a max pixel count (e.g., 1MP for reference images).
 *
 * @param sourcePath - Path to the source image
 * @param outputPath - Path to write the downscaled image
 * @param maxPixels - Maximum total pixels (default 1,000,000 = 1MP)
 */
export async function downscaleToMaxPixels(
  sourcePath: string,
  outputPath: string,
  maxPixels = 1_000_000
): Promise<void> {
  const metadata = await sharp(sourcePath).metadata()
  const width = metadata.width ?? 0
  const height = metadata.height ?? 0
  const pixels = width * height

  if (pixels <= maxPixels) {
    // Image is already small enough, just copy
    await sharp(sourcePath).toFile(outputPath)
    return
  }

  const scale = Math.sqrt(maxPixels / pixels)
  const newWidth = Math.round(width * scale)
  const newHeight = Math.round(height * scale)

  await sharp(sourcePath)
    .resize(newWidth, newHeight, { fit: 'inside' })
    .png()
    .toFile(outputPath)
}
