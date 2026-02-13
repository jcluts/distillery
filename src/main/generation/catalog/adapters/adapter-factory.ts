import type { CanonicalEndpointDef } from '../../../types'
import type { ProviderConfig } from '../provider-config-service'
import { transformWavespeed } from './wavespeed-adapter'
import { transformFal } from './fal-adapter'
import { transformReplicate } from './replicate-adapter'

export interface AdapterInput {
  providerConfig: ProviderConfig
  rawFeed: unknown
  defaultRequestSchema: CanonicalEndpointDef['requestSchema']
}

export interface ProviderAdapter {
  transform(input: AdapterInput): CanonicalEndpointDef[]
}

export function createProviderAdapter(adapterName?: string): ProviderAdapter | null {
  if (adapterName === 'wavespeed') {
    return {
      transform: (input) => transformWavespeed(input)
    }
  }

  if (adapterName === 'fal') {
    return {
      transform: (input) => transformFal(input)
    }
  }

  if (adapterName === 'replicate') {
    return {
      transform: (input) => transformReplicate(input)
    }
  }

  return null
}
