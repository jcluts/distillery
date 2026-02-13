import type { CanonicalEndpointDef } from '../../../types'
import type { AdapterInput } from './adapter-factory'

export function transformReplicate(input: AdapterInput): CanonicalEndpointDef[] {
  const models =
    (input.rawFeed as { models?: Array<{ slug: string; name?: string }> } | null)?.models ?? []

  return models.map((model) => ({
    endpointKey: `replicate.${model.slug}.image`,
    providerId: input.providerConfig.providerId,
    providerModelId: model.slug,
    canonicalModelId: undefined,
    displayName: model.name ?? model.slug,
    modes: ['text-to-image'],
    outputType: 'image',
    executionMode: 'remote-async',
    requestSchema: input.defaultRequestSchema
  }))
}
