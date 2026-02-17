import type { CanonicalEndpointDef } from '../../../types'
import type { AdapterInput } from './adapter-factory'

export function transformReplicate(input: AdapterInput): CanonicalEndpointDef[] {
  const models =
    (input.rawFeed as { models?: Array<{ slug?: unknown; name?: unknown }> } | null)?.models ?? []

  return models.flatMap((model) => {
    const slug = typeof model.slug === 'string' ? model.slug.trim() : ''
    if (!slug) return []

    const displayName =
      typeof model.name === 'string' && model.name.trim().length > 0 ? model.name.trim() : slug

    return [
      {
        endpointKey: `replicate.${slug}.image`,
        providerId: input.providerConfig.providerId,
        providerModelId: slug,
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
