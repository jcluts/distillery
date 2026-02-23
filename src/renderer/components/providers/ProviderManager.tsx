import * as React from 'react'

import { ProviderSidebar } from '@/components/providers/ProviderSidebar'
import { ProviderDetail } from '@/components/providers/ProviderDetail'
import { LocalDetail } from '@/components/providers/LocalDetail'
import { useProviderStore } from '@/stores/provider-store'
import { useModelBrowsingStore } from '@/stores/model-browsing-store'
import { useModelStore } from '@/stores/model-store'

export function ProviderManager(): React.JSX.Element {
  const loadProviders = useProviderStore((s) => s.loadProviders)
  const selectedProviderId = useProviderStore((s) => s.selectedProviderId)
  const loadAllUserModels = useModelBrowsingStore((s) => s.loadAllUserModels)
  const loadIdentities = useModelBrowsingStore((s) => s.loadIdentities)
  const hydrateModelStore = useModelStore((s) => s.hydrate)

  // Hydrate on mount
  React.useEffect(() => {
    void loadProviders().then(() => {
      void loadAllUserModels()
    })
    void loadIdentities()
    void hydrateModelStore()
  }, [loadProviders, loadAllUserModels, loadIdentities, hydrateModelStore])

  return (
    <div className="flex h-full min-h-0 gap-4">
      {/* Provider sidebar */}
      <div className="w-[200px] shrink-0">
        <ProviderSidebar />
      </div>

      {/* Detail panel */}
      <div className="min-w-0 flex-1">
        {selectedProviderId === 'local' ? (
          <LocalDetail />
        ) : selectedProviderId ? (
          <ProviderDetail providerId={selectedProviderId} />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Select a provider to configure
          </div>
        )}
      </div>
    </div>
  )
}
