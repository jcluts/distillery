import type {
  CanonicalRequestSchema,
  CanonicalSchemaProperty,
  GenerationMode
} from '../../../types'
import { asOptionalNumber, asRecord, getString } from '../../param-utils'
import type { ProviderConfig } from '../../catalog/provider-config'
import { normalizeRequestSchema } from '../../catalog/schema-normalizer'
import type { ProviderModel, SearchResultModel } from '../../management/types'
import type { ProviderAdapter } from './types'

const IMAGE_FORMATS = ['png', 'webp', 'jpeg']
const DEFAULT_ASPECT_RATIOS = ['1:1', '16:9', '9:16', '3:2', '2:3', '4:3', '3:4']
const DEFAULT_RESOLUTIONS = ['1K', '2K', '4K']
const DEFAULT_VIDEO_DURATIONS = ['5s', '10s', '15s']

interface VeniceModeInfo {
  type: GenerationMode
  modes: GenerationMode[]
  outputType: 'image' | 'video'
}

export function normalizeVeniceSearchResult(
  raw: unknown,
  _config: ProviderConfig
): SearchResultModel {
  const source = asRecord(raw) ?? {}
  const spec = asRecord(source.model_spec) ?? {}
  const modelId = getString(source.id) || ''
  const name = getString(spec.name) || getString(source.name) || modelId
  const description = getString(spec.description) || getString(source.description) || undefined
  const modeInfo = getVeniceModeInfo(source)

  return {
    modelId,
    name,
    description,
    type: modeInfo?.type,
    modes: modeInfo?.modes,
    outputType: modeInfo?.outputType,
    raw
  }
}

export function normalizeVeniceModelDetail(
  raw: unknown,
  config: ProviderConfig
): ProviderModel | null {
  const source = asRecord(raw)
  if (!source) return null

  const modeInfo = getVeniceModeInfo(source)
  if (!modeInfo) return null

  const searchResult = normalizeVeniceSearchResult(source, config)
  if (!searchResult.modelId) return null

  return {
    modelId: searchResult.modelId,
    name: searchResult.name,
    description: searchResult.description,
    type: modeInfo.type,
    modes: modeInfo.modes,
    outputType: modeInfo.outputType,
    providerId: config.providerId,
    requestSchema:
      modeInfo.outputType === 'video'
        ? buildVeniceVideoSchema(source, searchResult.modelId, modeInfo.modes)
        : modeInfo.type === 'image-to-image'
          ? buildVeniceEditSchema(source, searchResult.modelId)
          : buildVeniceImageSchema(source, searchResult.modelId)
  }
}

function getVeniceModeInfo(model: Record<string, unknown>): VeniceModeInfo | undefined {
  const type = getString(model.type)
  if (type === 'image') {
    return {
      type: 'text-to-image',
      modes: ['text-to-image'],
      outputType: 'image'
    }
  }

  if (type === 'inpaint') {
    return {
      type: 'image-to-image',
      modes: ['image-to-image'],
      outputType: 'image'
    }
  }

  if (type === 'video') {
    const spec = asRecord(model.model_spec) ?? {}
    const constraints = asRecord(spec.constraints) ?? {}
    const modelType = getString(constraints.model_type) ?? getString(constraints.modelType)
    const modes = getVeniceVideoModes(modelType)

    return {
      type: modes[0],
      modes,
      outputType: 'video'
    }
  }

  return undefined
}

function getVeniceVideoModes(modelType: string | null): GenerationMode[] {
  if (modelType === 'image-to-video') return ['image-to-video']
  if (modelType === 'text-to-video') return ['text-to-video']
  if (modelType === 'video') return ['text-to-video', 'image-to-video']
  return ['text-to-video']
}

function buildVeniceImageSchema(
  model: Record<string, unknown>,
  modelId: string
): CanonicalRequestSchema {
  const spec = asRecord(model.model_spec) ?? {}
  const constraints = asRecord(spec.constraints) ?? {}
  const properties: Record<string, CanonicalSchemaProperty> = {
    model: {
      type: 'string',
      title: 'Model',
      default: modelId,
      ui: { hidden: true }
    },
    prompt: {
      type: 'string',
      title: 'Prompt'
    },
    negative_prompt: {
      type: 'string',
      title: 'Negative Prompt'
    },
    format: {
      type: 'string',
      title: 'Format',
      default: 'png',
      enum: IMAGE_FORMATS
    },
    safe_mode: {
      type: 'boolean',
      title: 'Safe Mode',
      default: true
    },
    seed: {
      type: 'integer',
      title: 'Seed',
      minimum: -999999999,
      maximum: 999999999
    }
  }

  const aspectRatios = getStringArray(constraints.aspectRatios)
  const resolutions = getResolutionOptions(spec, constraints)
  const defaultAspectRatio = getString(constraints.defaultAspectRatio)
  const defaultResolution = getString(constraints.defaultResolution)

  if (aspectRatios.length > 0 || resolutions.length > 0) {
    properties.aspect_ratio = {
      type: 'string',
      title: 'Aspect Ratio',
      default: defaultAspectRatio ?? aspectRatios[0] ?? '1:1',
      enum: aspectRatios.length > 0 ? aspectRatios : DEFAULT_ASPECT_RATIOS
    }

    if (resolutions.length > 0 || defaultResolution) {
      properties.resolution = {
        type: 'string',
        title: 'Resolution',
        default: defaultResolution ?? resolutions[0] ?? '1K',
        enum: resolutions.length > 0 ? resolutions : DEFAULT_RESOLUTIONS
      }
    }
  } else {
    const maxDimension = 1280
    properties.width = {
      type: 'integer',
      title: 'Width',
      default: 1024,
      minimum: 1,
      maximum: maxDimension
    }
    properties.height = {
      type: 'integer',
      title: 'Height',
      default: 1024,
      minimum: 1,
      maximum: maxDimension
    }
  }

  const steps = asRecord(constraints.steps)
  const maxSteps = asOptionalNumber(steps?.max)
  const defaultSteps = asOptionalNumber(steps?.default)
  if (steps || maxSteps || defaultSteps) {
    properties.steps = {
      type: 'integer',
      title: 'Steps',
      default: defaultSteps ?? undefined,
      minimum: 1,
      maximum: maxSteps ?? undefined
    }
  }

  return normalizeRequestSchema({
    properties,
    required: ['model', 'prompt'],
    order: [
      'model',
      'prompt',
      'negative_prompt',
      'aspect_ratio',
      'resolution',
      'width',
      'height',
      'format',
      'safe_mode',
      'steps',
      'seed'
    ]
  })
}

function buildVeniceEditSchema(
  model: Record<string, unknown>,
  modelId: string
): CanonicalRequestSchema {
  const spec = asRecord(model.model_spec) ?? {}
  const constraints = asRecord(spec.constraints) ?? {}
  const aspectRatios = getStringArray(constraints.aspectRatios)
  const resolutions = getResolutionOptions(spec, constraints)
  const defaultResolution = getString(constraints.defaultResolution)

  const properties: Record<string, CanonicalSchemaProperty> = {
    modelId: {
      type: 'string',
      title: 'Model',
      default: modelId,
      ui: { hidden: true }
    },
    prompt: {
      type: 'string',
      title: 'Prompt'
    },
    images: {
      type: 'array',
      title: 'Input Images',
      items: { type: 'string', minItems: 1, maxItems: 3 },
      ui: { hidden: true }
    },
    output_format: {
      type: 'string',
      title: 'Output Format',
      default: 'png',
      enum: IMAGE_FORMATS
    },
    safe_mode: {
      type: 'boolean',
      title: 'Safe Mode',
      default: true
    }
  }

  if (aspectRatios.length > 0) {
    properties.aspect_ratio = {
      type: 'string',
      title: 'Aspect Ratio',
      default: aspectRatios.includes('auto') ? 'auto' : aspectRatios[0],
      enum: aspectRatios
    }
  }

  properties.resolution = {
    type: 'string',
    title: 'Resolution',
    description: 'Resolution tier for models that support explicit edit resolution.',
    default: defaultResolution ?? (resolutions.length > 0 ? resolutions[0] : undefined),
    enum: resolutions.length > 0 ? resolutions : DEFAULT_RESOLUTIONS
  }

  return normalizeRequestSchema({
    properties,
    required: ['modelId', 'prompt', 'images'],
    order: [
      'modelId',
      'prompt',
      'images',
      'aspect_ratio',
      'resolution',
      'output_format',
      'safe_mode'
    ]
  })
}

function buildVeniceVideoSchema(
  model: Record<string, unknown>,
  modelId: string,
  modes: GenerationMode[]
): CanonicalRequestSchema {
  const spec = asRecord(model.model_spec) ?? {}
  const constraints = asRecord(spec.constraints) ?? {}
  const aspectRatios = getStringArrayByKeys(constraints, ['aspect_ratios', 'aspectRatios'])
  const durations =
    getStringArrayByKeys(constraints, ['durations', 'duration']) ?? DEFAULT_VIDEO_DURATIONS
  const resolutions = getStringArrayByKeys(constraints, ['resolutions', 'resolution'])

  const properties: Record<string, CanonicalSchemaProperty> = {
    model: {
      type: 'string',
      title: 'Model',
      default: modelId,
      ui: { hidden: true }
    },
    prompt: {
      type: 'string',
      title: 'Prompt'
    },
    negative_prompt: {
      type: 'string',
      title: 'Negative Prompt'
    },
    duration: {
      type: 'string',
      title: 'Duration',
      default: getPreferredOption(durations, '5s'),
      enum: durations
    }
  }

  if (aspectRatios && aspectRatios.length > 0) {
    properties.aspect_ratio = {
      type: 'string',
      title: 'Aspect Ratio',
      default: getPreferredOption(aspectRatios, '16:9'),
      enum: aspectRatios
    }
  }

  if (resolutions && resolutions.length > 0) {
    properties.resolution = {
      type: 'string',
      title: 'Resolution',
      default: getPreferredOption(resolutions, '720p'),
      enum: resolutions
    }
  }

  if (modes.includes('image-to-video')) {
    properties.image_url = {
      type: 'string',
      title: 'Input Image',
      ui: { hidden: true }
    }
  }

  if (getBoolean(constraints.audio_configurable) ?? getBoolean(constraints.audio) ?? false) {
    properties.audio = {
      type: 'boolean',
      title: 'Audio',
      default: true
    }
  }

  return normalizeRequestSchema({
    properties,
    required: ['model', 'prompt', 'duration'],
    order: [
      'model',
      'prompt',
      'negative_prompt',
      'image_url',
      'duration',
      'aspect_ratio',
      'resolution',
      'audio'
    ]
  })
}

function getStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
}

function getStringArrayByKeys(
  source: Record<string, unknown>,
  keys: string[]
): string[] | undefined {
  for (const key of keys) {
    const value = getStringArray(source[key])
    if (value.length > 0) return value
  }
  return undefined
}

function getPreferredOption(options: string[], preferred: string): string {
  return options.includes(preferred) ? preferred : (options[0] ?? preferred)
}

function getBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function getResolutionOptions(
  spec: Record<string, unknown>,
  constraints: Record<string, unknown>
): string[] {
  const constraintResolutions = getStringArray(constraints.resolutions)
  if (constraintResolutions.length > 0) return constraintResolutions

  const pricing = asRecord(spec.pricing)
  const pricingResolutions = asRecord(pricing?.resolutions)
  if (!pricingResolutions) return []

  return Object.keys(pricingResolutions).filter((key) => key.length > 0)
}

export const veniceAdapter: ProviderAdapter = {
  normalizeSearchResult: normalizeVeniceSearchResult,
  normalizeModelDetail: normalizeVeniceModelDetail
}
