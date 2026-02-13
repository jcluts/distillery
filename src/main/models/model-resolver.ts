import * as fs from 'fs'
import * as path from 'path'
import type { AppSettings, ModelLoadParams } from '../types'
import type {
  ModelCatalog,
  ModelDefinition,
  ModelFilesCheckResult,
  ModelQuantSelections,
  QuantVariant
} from './types'

function normalizeSelections(value: unknown): ModelQuantSelections {
  if (!value || typeof value !== 'object') return {}
  return value as ModelQuantSelections
}

export class ModelResolver {
  constructor(
    private catalog: ModelCatalog,
    private settings: AppSettings
  ) {}

  private getModel(modelId: string): ModelDefinition {
    const model = this.catalog.models.find((m) => m.id === modelId)
    if (!model) {
      throw new Error(`Unknown model: ${modelId}`)
    }
    return model
  }

  private getModelSelections(modelId: string): {
    diffusionQuant: string
    textEncoderQuant: string
  } {
    const allSelections = normalizeSelections(this.settings.model_quant_selections)
    const selected = allSelections[modelId]
    return {
      diffusionQuant: selected?.diffusionQuant ?? '',
      textEncoderQuant: selected?.textEncoderQuant ?? ''
    }
  }

  private getQuant(
    model: ModelDefinition,
    kind: 'diffusion' | 'textEncoder',
    quantId: string
  ): QuantVariant {
    const quant = model[kind].quants.find((q) => q.id === quantId)
    if (!quant) {
      throw new Error(`Unknown ${kind} quant: ${quantId}`)
    }
    return quant
  }

  getActiveModelPaths(): ModelLoadParams {
    const model = this.getModel(this.settings.active_model_id)
    const selections = this.getModelSelections(model.id)

    if (!selections.diffusionQuant || !selections.textEncoderQuant) {
      throw new Error(`Missing quant selections for model: ${model.id}`)
    }

    const diffusionQuant = this.getQuant(model, 'diffusion', selections.diffusionQuant)
    const textEncoderQuant = this.getQuant(model, 'textEncoder', selections.textEncoderQuant)

    return {
      diffusion_model: this.resolveRelative(diffusionQuant.file),
      vae: this.resolveRelative(model.vae.file),
      llm: this.resolveRelative(textEncoderQuant.file)
    }
  }

  resolveRelative(relativePath: string): string {
    return path.join(this.settings.model_base_path, relativePath)
  }

  isFileDownloaded(relativePath: string): boolean {
    return fs.existsSync(this.resolveRelative(relativePath))
  }

  getModelFileStatuses(modelId: string): ModelFilesCheckResult {
    const model = this.getModel(modelId)

    const files = [
      { relativePath: model.vae.file, exists: this.isFileDownloaded(model.vae.file) },
      ...model.diffusion.quants.map((q) => ({
        relativePath: q.file,
        exists: this.isFileDownloaded(q.file)
      })),
      ...model.textEncoder.quants.map((q) => ({
        relativePath: q.file,
        exists: this.isFileDownloaded(q.file)
      }))
    ]

    return {
      modelId,
      isReady: this.isModelReady(modelId),
      files
    }
  }

  isModelReady(modelId: string): boolean {
    const model = this.catalog.models.find((m) => m.id === modelId)
    if (!model) return false

    const selections = this.getModelSelections(modelId)
    if (!selections.diffusionQuant || !selections.textEncoderQuant) {
      return false
    }

    const diff = model.diffusion.quants.find((q) => q.id === selections.diffusionQuant)
    const text = model.textEncoder.quants.find((q) => q.id === selections.textEncoderQuant)

    if (!diff || !text) {
      return false
    }

    return (
      this.isFileDownloaded(model.vae.file) &&
      this.isFileDownloaded(diff.file) &&
      this.isFileDownloaded(text.file)
    )
  }
}
