import type { CanonicalEndpointDef } from '../../../types'
import type { ProviderConfig } from '../provider-config-service'

interface AdapterInput {
  providerConfig: ProviderConfig
  rawFeed: unknown
  defaultRequestSchema: CanonicalEndpointDef['requestSchema']
}

export function transformFal(input: AdapterInput): CanonicalEndpointDef[] {
  const models =
    (input.rawFeed as { models?: Array<{ id: string; title?: string }> } | null)?.models ?? []

  return models.map((model) => ({
    endpointKey: `fal.${model.id}.image`,
    providerId: input.providerConfig.providerId,
    providerModelId: model.id,
    canonicalModelId: undefined,
    displayName: model.title ?? model.id,
    modes: ['text-to-image'],
    outputType: 'image',
    executionMode: 'remote-async',
    requestSchema: input.defaultRequestSchema
  }))
}
