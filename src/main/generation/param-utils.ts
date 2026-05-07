import { randomInt } from 'crypto'
import type { CanonicalGenerationParams, CanonicalRequestSchema, GenerationMode } from '../types'

const GENERATION_MODES: GenerationMode[] = [
  'text-to-image',
  'image-to-image',
  'text-to-video',
  'image-to-video'
]

const IMAGE_INPUT_FIELD_NAMES = new Set([
  'images',
  'image_urls',
  'image_url',
  'image',
  'init_image',
  'init_image_url',
  'input_image',
  'input_image_url',
  'reference_image',
  'reference_images',
  'ref_images'
])

const PROMPT_FIELD_NAMES = new Set(['prompt', 'text', 'caption'])

/**
 * Coerce an unknown value to a string. Returns '' for null/undefined.
 */
export function asString(value: unknown): string {
  return typeof value === 'string' ? value : String(value ?? '')
}

export function getString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null
  return value as Record<string, unknown>
}

/**
 * Coerce an unknown value to a number. Returns 0 for non-finite results.
 */
export function asNumber(value: unknown): number {
  if (typeof value === 'number') return value
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * Coerce an unknown value to a number or null.
 */
export function asOptionalNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export const toOptionalNumber = asOptionalNumber

/**
 * Parse width and height from params. Handles both separate width/height
 * fields and combined "size" strings (e.g. "2048*2048").
 */
export function extractDimensions(params: CanonicalGenerationParams): {
  width: number | null
  height: number | null
} {
  let width = asOptionalNumber(params.width)
  let height = asOptionalNumber(params.height)

  if (width == null || height == null) {
    const sizeStr = typeof params.size === 'string' ? params.size : ''
    if (sizeStr.includes('*')) {
      const [w, h] = sizeStr.split('*').map(Number)
      if (Number.isFinite(w) && Number.isFinite(h)) {
        width = w
        height = h
      }
    }
  }

  return { width, height }
}

/**
 * If seed is null/undefined/empty, generate a random seed.
 * Uses the range 0–2^31-1 for broad engine compatibility.
 */
export function resolveOrGenerateSeed(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return value
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed) && parsed >= 0) return parsed
  }
  return randomInt(0, 2_147_483_647)
}

/**
 * Return params with a resolved seed (random if blank/missing).
 */
export function withResolvedSeed(params: CanonicalGenerationParams): CanonicalGenerationParams {
  return { ...params, seed: resolveOrGenerateSeed(params.seed) }
}

export function coerceGenerationMode(raw: string | null | undefined): GenerationMode | undefined {
  if (!raw) return undefined
  const haystack = raw.toLowerCase().trim()

  if (haystack === 'text-to-image' || haystack === 'txt2img' || haystack === 't2i') {
    return 'text-to-image'
  }
  if (
    haystack === 'image-to-image' ||
    haystack === 'img2img' ||
    haystack === 'i2i' ||
    haystack === 'edit' ||
    haystack === 'image-editing'
  ) {
    return 'image-to-image'
  }
  if (haystack === 'text-to-video' || haystack === 'txt2vid' || haystack === 't2v') {
    return 'text-to-video'
  }
  if (haystack === 'image-to-video' || haystack === 'img2vid' || haystack === 'i2v') {
    return 'image-to-video'
  }

  if (haystack.includes('video')) {
    return haystack.includes('image') ? 'image-to-video' : 'text-to-video'
  }
  if (
    haystack.includes('edit') ||
    haystack.includes('img2img') ||
    haystack.includes('image-to-image')
  ) {
    return 'image-to-image'
  }
  if (haystack.includes('image') || haystack.includes('generation')) {
    return 'text-to-image'
  }

  return undefined
}

function coerceExplicitGenerationMode(raw: string | null | undefined): GenerationMode | undefined {
  if (!raw) return undefined
  const haystack = raw.toLowerCase().trim()

  if (haystack === 'text-to-image' || haystack === 'txt2img' || haystack === 't2i') {
    return 'text-to-image'
  }
  if (
    haystack === 'image-to-image' ||
    haystack === 'img2img' ||
    haystack === 'i2i' ||
    haystack === 'edit' ||
    haystack === 'image-editing'
  ) {
    return 'image-to-image'
  }
  if (haystack === 'text-to-video' || haystack === 'txt2vid' || haystack === 't2v') {
    return 'text-to-video'
  }
  if (haystack === 'image-to-video' || haystack === 'img2vid' || haystack === 'i2v') {
    return 'image-to-video'
  }

  return undefined
}

export function normalizeGenerationModes(values: unknown): GenerationMode[] {
  const rawValues = Array.isArray(values) ? values : [values]
  const modes: GenerationMode[] = []

  for (const value of rawValues) {
    const mode =
      typeof value === 'string' && GENERATION_MODES.includes(value as GenerationMode)
        ? (value as GenerationMode)
        : coerceGenerationMode(typeof value === 'string' ? value : undefined)
    if (mode && !modes.includes(mode)) modes.push(mode)
  }

  return modes
}

export function schemaHasImageInput(schema: CanonicalRequestSchema | undefined): boolean {
  if (!schema?.properties) return false

  return Object.keys(schema.properties).some((key) =>
    IMAGE_INPUT_FIELD_NAMES.has(key.toLowerCase())
  )
}

export function schemaHasPromptInput(schema: CanonicalRequestSchema | undefined): boolean {
  if (!schema?.properties) return false

  return Object.keys(schema.properties).some((key) => PROMPT_FIELD_NAMES.has(key.toLowerCase()))
}

export function schemaRequiresOnlyImageInput(schema: CanonicalRequestSchema | undefined): boolean {
  const required = schema?.required ?? []
  if (required.length === 0) return false

  return required.every((key) => IMAGE_INPUT_FIELD_NAMES.has(key.toLowerCase()))
}

export function inferModeInfo(
  type: GenerationMode | string | undefined,
  modelId: string,
  options?: {
    name?: string
    description?: string
    requestSchema?: CanonicalRequestSchema
  }
): {
  modes: GenerationMode[]
  outputType: 'image' | 'video'
} {
  const coerced = coerceExplicitGenerationMode(type)
  if (coerced) {
    const isVideo = coerced === 'text-to-video' || coerced === 'image-to-video'
    return { modes: [coerced], outputType: isVideo ? 'video' : 'image' }
  }

  const haystack = [type, modelId, options?.name, options?.description]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase()

  if (haystack.includes('video')) {
    const hasImageInput =
      schemaHasImageInput(options?.requestSchema) ||
      haystack.includes('image-to-video') ||
      haystack.includes('img2vid') ||
      haystack.includes('i2v')
    const supportsPromptOnly =
      schemaHasPromptInput(options?.requestSchema) ||
      (!schemaRequiresOnlyImageInput(options?.requestSchema) &&
        !haystack.includes('image-to-video') &&
        !haystack.includes('img2vid') &&
        !haystack.includes('i2v'))
    const modes: GenerationMode[] = []

    if (supportsPromptOnly) modes.push('text-to-video')
    if (hasImageInput) modes.push('image-to-video')

    return {
      modes: modes.length > 0 ? modes : ['text-to-video'],
      outputType: 'video'
    }
  }

  return {
    modes:
      haystack.includes('edit') || haystack.includes('image-to-image')
        ? ['image-to-image']
        : ['text-to-image'],
    outputType: 'image'
  }
}
