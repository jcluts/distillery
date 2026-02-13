import * as fs from 'fs'
import * as path from 'path'
import type { AppSettings, ModelQuantSelections } from '../types'
import type { ModelCatalog, ModelDefinition, QuantVariant } from './types'

function ensureSelectionShape(
  selections: ModelQuantSelections,
  modelId: string
): {
  diffusionQuant: string
  textEncoderQuant: string
} {
  const existing = selections[modelId]
  return {
    diffusionQuant: existing?.diffusionQuant ?? '',
    textEncoderQuant: existing?.textEncoderQuant ?? ''
  }
}

function firstDownloadedQuant(modelBasePath: string, quants: QuantVariant[]): string {
  const found = quants.find((quant) =>
    fs.existsSync(path.join(modelBasePath, path.normalize(quant.file)))
  )

  return found?.id ?? ''
}

function maybeBootstrapModelSelections(
  model: ModelDefinition,
  modelBasePath: string,
  selections: ModelQuantSelections
): boolean {
  const current = ensureSelectionShape(selections, model.id)
  let changed = false

  if (!current.diffusionQuant) {
    const detected = firstDownloadedQuant(modelBasePath, model.diffusion.quants)
    if (detected) {
      current.diffusionQuant = detected
      changed = true
    }
  }

  if (!current.textEncoderQuant) {
    const detected = firstDownloadedQuant(modelBasePath, model.textEncoder.quants)
    if (detected) {
      current.textEncoderQuant = detected
      changed = true
    }
  }

  if (changed) {
    selections[model.id] = current
  }

  return changed
}

export function bootstrapQuantSelections(args: {
  catalog: ModelCatalog
  settings: AppSettings
  modelId?: string
}): {
  updated: boolean
  selections: ModelQuantSelections
} {
  const { catalog, settings, modelId } = args

  const nextSelections: ModelQuantSelections = JSON.parse(
    JSON.stringify(settings.model_quant_selections ?? {})
  )

  const models = modelId ? catalog.models.filter((model) => model.id === modelId) : catalog.models

  let updated = false

  for (const model of models) {
    updated =
      maybeBootstrapModelSelections(model, settings.model_base_path, nextSelections) || updated
  }

  return {
    updated,
    selections: nextSelections
  }
}
