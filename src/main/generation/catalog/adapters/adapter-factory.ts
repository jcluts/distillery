import type { CanonicalEndpointDef } from '../../../types'
import type { SearchResultModel, ProviderModel } from '../../api/types'
import type { ProviderConfig } from '../provider-config-service'
import { transformWavespeed } from './wavespeed-adapter'
import { transformFal } from './fal-adapter'
import { transformReplicate } from './replicate-adapter'
import {
  normalizeWavespeedModelDetail,
  normalizeWavespeedSearchResult
} from './wavespeed-adapter'
import { normalizeFalModelDetail, normalizeFalSearchResult } from './fal-adapter'
import {
  normalizeReplicateModelDetail,
  normalizeReplicateSearchResult
} from './replicate-adapter'

export interface AdapterInput {
  providerConfig: ProviderConfig
  rawFeed: unknown
  defaultRequestSchema: CanonicalEndpointDef['requestSchema']
}

export interface ProviderAdapter {
  transform(input: AdapterInput): CanonicalEndpointDef[]
  normalizeSearchResult(raw: unknown, config: ProviderConfig): SearchResultModel
  normalizeModelDetail(raw: unknown, config: ProviderConfig): ProviderModel | null
}

export function createProviderAdapter(adapterName?: string): ProviderAdapter | null {
  if (adapterName === 'wavespeed') {
    return {
      transform: (input) => transformWavespeed(input),
      normalizeSearchResult: (raw, config) => normalizeWavespeedSearchResult(raw, config),
      normalizeModelDetail: (raw, config) => normalizeWavespeedModelDetail(raw, config)
    }
  }

  if (adapterName === 'fal') {
    return {
      transform: (input) => transformFal(input),
      normalizeSearchResult: (raw, config) => normalizeFalSearchResult(raw, config),
      normalizeModelDetail: (raw, config) => normalizeFalModelDetail(raw, config)
    }
  }

  if (adapterName === 'replicate') {
    return {
      transform: (input) => transformReplicate(input),
      normalizeSearchResult: (raw, config) => normalizeReplicateSearchResult(raw, config),
      normalizeModelDetail: (raw, config) => normalizeReplicateModelDetail(raw, config)
    }
  }

  return null
}
