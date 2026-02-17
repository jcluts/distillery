import type { CanonicalEndpointDef } from '../../../types'
import type { AdapterInput } from './adapter-factory'

export function transformFal(input: AdapterInput): CanonicalEndpointDef[] {
  const models =
    (input.rawFeed as { models?: Array<{ id?: unknown; title?: unknown }> } | null)?.models ?? []

  return models.flatMap((model) => {
    const modelId = typeof model.id === 'string' ? model.id.trim() : ''
    if (!modelId) return []

    const displayName =
      typeof model.title === 'string' && model.title.trim().length > 0
        ? model.title.trim()
        : modelId

    return [
      {
        endpointKey: `fal.${modelId}.image`,
        providerId: input.providerConfig.providerId,
        providerModelId: modelId,
        canonicalModelId: undefined,
        displayName,
        modes: ['text-to-image'],
        outputType: 'image',
        executionMode: 'remote-async',
        requestSchema: input.defaultRequestSchema
      }
    ]
  })
}
