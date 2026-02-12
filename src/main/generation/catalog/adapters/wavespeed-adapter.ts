import type { CanonicalEndpointDef } from '../../../types'
import type { ProviderConfig } from '../provider-config-service'

interface AdapterInput {
  providerConfig: ProviderConfig
  rawFeed: unknown
  defaultRequestSchema: CanonicalEndpointDef['requestSchema']
}

export function transformWavespeed(input: AdapterInput): CanonicalEndpointDef[] {
  const models =
    (input.rawFeed as { models?: Array<{ id: string; name?: string }> } | null)?.models ?? []

  return models.map((model) => ({
    endpointKey: `wavespeed.${model.id}.image`,
    providerId: input.providerConfig.providerId,
    providerModelId: model.id,
    canonicalModelId: undefined,
    displayName: model.name ?? model.id,
    modes: ['text-to-image'],
    outputType: 'image',
    executionMode: 'remote-async',
    requestSchema: input.defaultRequestSchema
  }))
}
