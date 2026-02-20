import * as React from 'react'

import { ProviderSidebar } from '@/components/providers/ProviderSidebar'
import { ProviderDetail } from '@/components/providers/ProviderDetail'
import { useProviderStore } from '@/stores/provider-store'

export function ProviderManager(): React.JSX.Element {
  const loadProviders = useProviderStore((s) => s.loadProviders)
  const loadAllUserModels = useProviderStore((s) => s.loadAllUserModels)
  const loadIdentities = useProviderStore((s) => s.loadIdentities)
  const selectedProviderId = useProviderStore((s) => s.selectedProviderId)

  // Hydrate on mount
  React.useEffect(() => {
    void loadProviders().then(() => {
      void loadAllUserModels()
    })
    void loadIdentities()
  }, [loadProviders, loadAllUserModels, loadIdentities])

  return (
    <div className="flex h-full min-h-0 gap-4">
      {/* Provider sidebar */}
      <div className="w-[200px] shrink-0">
        <ProviderSidebar />
      </div>

      {/* Detail panel */}
      <div className="min-w-0 flex-1">
        {selectedProviderId ? (
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
