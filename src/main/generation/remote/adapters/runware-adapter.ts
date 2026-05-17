import type {
  CanonicalRequestSchema,
  CanonicalSchemaProperty,
  GenerationMode
} from '../../../types'
import { asOptionalNumber, asRecord, getString } from '../../param-utils'
import { normalizeRequestSchema } from '../../catalog/schema-normalizer'
import type { ProviderConfig } from '../../catalog/provider-config'
import type { ProviderModel, SearchResultModel } from '../../management/types'
import type { ProviderAdapter } from './types'

const IMAGE_FORMATS = ['JPG', 'PNG', 'WEBP']

interface RunwareModeInfo {
  type: GenerationMode
  modes: GenerationMode[]
  outputType: 'image' | 'video'
}

export function normalizeRunwareSearchResult(
  raw: unknown,
  _config: ProviderConfig
): SearchResultModel {
  const source = asRecord(raw) ?? {}
  const modelId = getString(source.air) || getString(source.id) || ''
  const name = getRunwareModelName(source, modelId)
  const description = getRunwareDescription(source)
  const modeInfo = getRunwareModeInfo(source)

  return {
    modelId,
    name,
    description,
    type: modeInfo.type,
    modes: modeInfo.modes,
    outputType: modeInfo.outputType,
    raw
  }
}

export function normalizeRunwareModelDetail(
  raw: unknown,
  config: ProviderConfig
): ProviderModel | null {
  const source = asRecord(raw)
  if (!source) return null

  const searchResult = normalizeRunwareSearchResult(source, config)
  if (!searchResult.modelId) return null

  const modeInfo = getRunwareModeInfo(source)

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
        ? buildRunwareVideoSchema(source, searchResult.modelId, modeInfo.modes)
        : buildRunwareImageSchema(source, searchResult.modelId, modeInfo.modes)
  }
}

function getRunwareModelName(source: Record<string, unknown>, fallback: string): string {
  const name = getString(source.name)
  const version = getString(source.version)
  if (name && version && !name.toLowerCase().includes(version.toLowerCase())) {
    return `${name} ${version}`
  }
  return name || fallback
}

function getRunwareDescription(source: Record<string, unknown>): string | undefined {
  const comment = getString(source.comment)
  const architecture = getString(source.architecture)
  const baseModel = getString(source.baseModel)
  const tags = Array.isArray(source.tags)
    ? source.tags.filter((entry): entry is string => typeof entry === 'string').slice(0, 8)
    : []

  return [
    comment,
    architecture ? `Architecture: ${architecture}` : null,
    baseModel,
    tags.join(', ')
  ]
    .filter(Boolean)
    .join(' · ')
}

function getRunwareModeInfo(source: Record<string, unknown>): RunwareModeInfo {
  const modelId = getString(source.air) || getString(source.id) || ''
  const name = getString(source.name) || ''
  const category = getString(source.category) || ''
  const type = getString(source.type) || ''
  const haystack = [modelId, name, category, type, getString(source.comment)]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  if (haystack.includes('video')) {
    const hasImageInput =
      haystack.includes('image-to-video') ||
      haystack.includes('img2vid') ||
      haystack.includes('i2v')
    return {
      type: hasImageInput ? 'image-to-video' : 'text-to-video',
      modes: hasImageInput ? ['text-to-video', 'image-to-video'] : ['text-to-video'],
      outputType: 'video'
    }
  }

  return {
    type: 'text-to-image',
    modes: ['text-to-image', 'image-to-image'],
    outputType: 'image'
  }
}

function buildRunwareImageSchema(
  model: Record<string, unknown>,
  modelId: string,
  modes: GenerationMode[]
): CanonicalRequestSchema {
  const defaultWidth = asOptionalNumber(model.defaultWidth) ?? 1024
  const defaultHeight = asOptionalNumber(model.defaultHeight) ?? 1024
  const defaultSteps = asOptionalNumber(model.defaultSteps) ?? 20
  const defaultCfg = asOptionalNumber(model.defaultCFG) ?? undefined
  const defaultScheduler = getString(model.defaultScheduler)

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
    width: {
      type: 'integer',
      title: 'Width',
      default: defaultWidth,
      minimum: 64,
      maximum: 4096,
      step: 64
    },
    height: {
      type: 'integer',
      title: 'Height',
      default: defaultHeight,
      minimum: 64,
      maximum: 4096,
      step: 64
    },
    steps: {
      type: 'integer',
      title: 'Steps',
      default: defaultSteps,
      minimum: 1,
      maximum: 100
    },
    numberResults: {
      type: 'integer',
      title: 'Images',
      default: 1,
      minimum: 1,
      maximum: 4
    },
    outputFormat: {
      type: 'string',
      title: 'Output Format',
      default: 'JPG',
      enum: IMAGE_FORMATS
    },
    seed: {
      type: 'integer',
      title: 'Seed',
      minimum: 0,
      maximum: 2147483647
    }
  }

  if (modes.includes('image-to-image')) {
    properties.seedImage = {
      type: 'string',
      title: 'Seed Image',
      ui: { hidden: true }
    }
    properties.strength = {
      type: 'number',
      title: 'Strength',
      default: 0.9,
      minimum: 0,
      maximum: 1,
      step: 0.05
    }
  }

  if (defaultCfg !== undefined) {
    properties.CFGScale = {
      type: 'number',
      title: 'CFG Scale',
      default: defaultCfg,
      minimum: 0,
      maximum: 32,
      step: 0.5
    }
  }

  if (defaultScheduler) {
    properties.scheduler = {
      type: 'string',
      title: 'Scheduler',
      default: defaultScheduler
    }
  }

  return normalizeRequestSchema({
    properties,
    required: ['model', 'prompt'],
    order: [
      'model',
      'prompt',
      'seedImage',
      'width',
      'height',
      'steps',
      'strength',
      'CFGScale',
      'scheduler',
      'numberResults',
      'outputFormat',
      'seed'
    ]
  })
}

function buildRunwareVideoSchema(
  _model: Record<string, unknown>,
  modelId: string,
  modes: GenerationMode[]
): CanonicalRequestSchema {
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
    width: {
      type: 'integer',
      title: 'Width',
      default: 1280,
      minimum: 64,
      maximum: 1920,
      step: 64
    },
    height: {
      type: 'integer',
      title: 'Height',
      default: 720,
      minimum: 64,
      maximum: 1920,
      step: 64
    },
    duration: {
      type: 'integer',
      title: 'Duration',
      default: 5,
      minimum: 3,
      maximum: 15,
      step: 1
    },
    deliveryMethod: {
      type: 'string',
      title: 'Delivery Method',
      default: 'async',
      ui: { hidden: true }
    },
    seed: {
      type: 'integer',
      title: 'Seed',
      minimum: 0,
      maximum: 2147483647
    }
  }

  if (modes.includes('image-to-video')) {
    properties['inputs.frameImages'] = {
      type: 'array',
      title: 'Frame Images',
      items: { type: 'string', minItems: 1, maxItems: 1 },
      ui: { hidden: true }
    }
  }

  return normalizeRequestSchema({
    properties,
    required: ['model', 'prompt'],
    order: [
      'model',
      'prompt',
      'inputs.frameImages',
      'width',
      'height',
      'duration',
      'deliveryMethod',
      'seed'
    ]
  })
}

export const runwareAdapter: ProviderAdapter = {
  normalizeSearchResult: normalizeRunwareSearchResult,
  normalizeModelDetail: normalizeRunwareModelDetail
}
