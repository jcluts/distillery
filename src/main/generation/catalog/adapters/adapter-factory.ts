import type { SearchResultModel, ProviderModel } from '../../api/types'
import type { ProviderConfig } from '../provider-config-service'
import {
  normalizeWavespeedModelDetail,
  normalizeWavespeedSearchResult
} from './wavespeed-adapter'
import { normalizeFalModelDetail, normalizeFalSearchResult } from './fal-adapter'
import {
  normalizeReplicateModelDetail,
  normalizeReplicateSearchResult
} from './replicate-adapter'

export interface ProviderAdapter {
  normalizeSearchResult(raw: unknown, config: ProviderConfig): SearchResultModel
  normalizeModelDetail(raw: unknown, config: ProviderConfig): ProviderModel | null
}

export function createProviderAdapter(adapterName?: string): ProviderAdapter | null {
  if (adapterName === 'wavespeed') {
    return {
      normalizeSearchResult: (raw, config) => normalizeWavespeedSearchResult(raw, config),
      normalizeModelDetail: (raw, config) => normalizeWavespeedModelDetail(raw, config)
    }
  }

  if (adapterName === 'fal') {
    return {
      normalizeSearchResult: (raw, config) => normalizeFalSearchResult(raw, config),
      normalizeModelDetail: (raw, config) => normalizeFalModelDetail(raw, config)
    }
  }

  if (adapterName === 'replicate') {
    return {
      normalizeSearchResult: (raw, config) => normalizeReplicateSearchResult(raw, config),
      normalizeModelDetail: (raw, config) => normalizeReplicateModelDetail(raw, config)
    }
  }

  return null
}
