import type { CanonicalEndpointDef } from '../../../types'
import type { AdapterInput } from './adapter-factory'

export function transformWavespeed(input: AdapterInput): CanonicalEndpointDef[] {
  const models =
    (input.rawFeed as { models?: Array<{ id?: unknown; name?: unknown }> } | null)?.models ?? []

  return models.flatMap((model) => {
    const modelId = typeof model.id === 'string' ? model.id.trim() : ''
    if (!modelId) return []

    const displayName =
      typeof model.name === 'string' && model.name.trim().length > 0
        ? model.name.trim()
        : modelId

    return [
      {
        endpointKey: `wavespeed.${modelId}.image`,
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
