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
  'image_input',
  'input_urls',
  'seedimage',
  'first_frame_url',
  'last_frame_url',
  'reference_image',
  'reference_images',
  'ref_images',
  'inputs.referenceimages',
  'inputs.frameimages',
  'inputs.video'
])

const PROMPT_FIELD_NAMES = new Set([
  'prompt',
  'positiveprompt',
  'positive_prompt',
  'text',
  'caption'
])

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
 * Parse width and height from params. Handles separate width/height fields,
 * combined "size" strings (e.g. "2048*2048"), and provider object sizes.
 */
export function extractDimensions(params: CanonicalGenerationParams): {
  width: number | null
  height: number | null
} {
  let width = asOptionalNumber(params.width)
  let height = asOptionalNumber(params.height)

  if (width == null || height == null) {
    const fromSize = extractWidthHeight(params.size) ?? extractWidthHeight(params.image_size)
    if (fromSize) {
      width = fromSize.width
      height = fromSize.height
    }
  }

  return { width, height }
}

function extractWidthHeight(value: unknown): { width: number; height: number } | null {
  const record = asRecord(value)
  if (record) {
    const width = asOptionalNumber(record.width)
    const height = asOptionalNumber(record.height)
    return width != null && height != null ? { width, height } : null
  }

  if (typeof value === 'string') {
    const parts = value.includes('*') ? value.split('*') : value.toLowerCase().split('x')
    const width = Number(parts[0])
    const height = Number(parts[1])
    if (parts.length === 2 && Number.isFinite(width) && Number.isFinite(height)) {
      return { width, height }
    }
  }

  return null
}

export function requestSchemaHasParam(
  schema: CanonicalRequestSchema | undefined,
  paramName: string
): boolean {
  return !!schema?.properties && Object.prototype.hasOwnProperty.call(schema.properties, paramName)
}

export function filterParamsForRequestSchema(
  params: CanonicalGenerationParams,
  schema: CanonicalRequestSchema | undefined,
  alwaysKeep: string[] = []
): CanonicalGenerationParams {
  if (!schema?.properties) {
    return { ...params }
  }

  const allowed = new Set([...Object.keys(schema.properties), ...alwaysKeep])
  return Object.fromEntries(
    Object.entries(params).filter(([key]) => allowed.has(key))
  ) as CanonicalGenerationParams
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

  return Object.keys(schema.properties).some((key) => isImageInputFieldName(key))
}

export function schemaHasPromptInput(schema: CanonicalRequestSchema | undefined): boolean {
  if (!schema?.properties) return false

  return Object.keys(schema.properties).some((key) => {
    const normalized = key.toLowerCase()
    const lastSegment = normalized.split('.').pop()
    return (
      PROMPT_FIELD_NAMES.has(normalized) || (!!lastSegment && PROMPT_FIELD_NAMES.has(lastSegment))
    )
  })
}

export function schemaRequiresOnlyImageInput(schema: CanonicalRequestSchema | undefined): boolean {
  const required = schema?.required ?? []
  if (required.length === 0) return false

  return required.every((key) => isImageInputFieldName(key))
}

function isImageInputFieldName(fieldName: string): boolean {
  const normalized = fieldName.toLowerCase()
  if (IMAGE_INPUT_FIELD_NAMES.has(normalized)) return true

  const lastSegment = normalized.split('.').pop()
  return !!lastSegment && IMAGE_INPUT_FIELD_NAMES.has(lastSegment)
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
  const haystack = [type, modelId, options?.name, options?.description]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase()

  const hasImageInput = schemaHasImageInput(options?.requestSchema)
  const hasPromptInput = schemaHasPromptInput(options?.requestSchema)
  const requiresOnlyImageInput = schemaRequiresOnlyImageInput(options?.requestSchema)
  const isVideo =
    coerced === 'text-to-video' || coerced === 'image-to-video' || haystack.includes('video')

  if (isVideo) {
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

    if (coerced === 'text-to-video' || supportsPromptOnly) modes.push('text-to-video')
    if (coerced === 'image-to-video' || hasImageInput) modes.push('image-to-video')

    return {
      modes: modes.length > 0 ? modes : ['text-to-video'],
      outputType: 'video'
    }
  }

  const supportsPromptOnly =
    coerced === 'text-to-image' ||
    hasPromptInput ||
    (!coerced && !requiresOnlyImageInput && !haystack.includes('image-to-image'))
  const supportsImageInput =
    coerced === 'image-to-image' ||
    hasImageInput ||
    haystack.includes('edit') ||
    haystack.includes('img2img') ||
    haystack.includes('image-to-image')
  const modes: GenerationMode[] = []

  if (supportsPromptOnly) modes.push('text-to-image')
  if (supportsImageInput) modes.push('image-to-image')

  return {
    modes: modes.length > 0 ? modes : ['text-to-image'],
    outputType: 'image'
  }
}
