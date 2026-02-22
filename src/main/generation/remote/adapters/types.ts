import type { SearchResultModel, ProviderModel } from '../../management/types'
import type { ProviderConfig } from '../../catalog/provider-config'

export interface ProviderAdapter {
  normalizeSearchResult(raw: unknown, config: ProviderConfig): SearchResultModel
  normalizeModelDetail(raw: unknown, config: ProviderConfig): ProviderModel | null
}
