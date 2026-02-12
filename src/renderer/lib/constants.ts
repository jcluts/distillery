// =============================================================================
// Resolution presets, aspect ratios, and default values
// =============================================================================

export const RESOLUTION_PRESETS = [
  { label: '512px', value: 512 },
  { label: '1024px', value: 1024 }
] as const

export const ASPECT_RATIOS = [
  { label: '1:1', width: 1, height: 1 },
  { label: '3:2', width: 3, height: 2 },
  { label: '2:3', width: 2, height: 3 },
  { label: '16:9', width: 16, height: 9 },
  { label: '9:16', width: 9, height: 16 },
  { label: '4:5', width: 4, height: 5 }
] as const

export type AspectRatioLabel = (typeof ASPECT_RATIOS)[number]['label']

/**
 * Compute pixel dimensions for a given long edge and aspect ratio.
 */
export function computeDimensions(
  longEdge: number,
  ratioW: number,
  ratioH: number
): { width: number; height: number } {
  if (ratioW >= ratioH) {
    // Landscape or square
    const width = longEdge
    const height = Math.round((longEdge * ratioH) / ratioW)
    return { width, height }
  } else {
    // Portrait
    const height = longEdge
    const width = Math.round((longEdge * ratioW) / ratioH)
    return { width, height }
  }
}

// Default generation parameters
export const GENERATION_DEFAULTS = {
  steps: 4,
  guidance: 3.5,
  sampling_method: 'euler',
  resolution: 1024,
  aspectRatio: '1:1' as AspectRatioLabel
}

// Thumbnail sizes
export const THUMBNAIL_SIZE_MIN = 100
export const THUMBNAIL_SIZE_MAX = 400
export const THUMBNAIL_SIZE_DEFAULT = 200

// Grid
export const GRID_PAGE_SIZE = 200
export const GRID_BUFFER_ROWS = 5

// Loupe
export const LOUPE_PRELOAD_COUNT = 1 // preload next/prev images

// Window constraints
export const MIN_WINDOW_WIDTH = 960
export const MIN_WINDOW_HEIGHT = 600
