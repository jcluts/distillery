import * as React from 'react'

import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Item,
  ItemContent,
  ItemTitle,
  ItemActions,
  ItemGroup
} from '@/components/ui/item'
import { useProviderStore } from '@/stores/provider-store'

/**
 * Status dot semantics:
 *  green  — API key saved
 *  gray   — no API key configured
 */
function statusDot(hasKey: boolean): React.JSX.Element {
  const color = hasKey ? 'bg-emerald-500' : 'bg-muted-foreground/40'
  return <span className={cn('size-2 shrink-0 rounded-full', color)} />
}

export function ProviderSidebar(): React.JSX.Element {
  const providers = useProviderStore((s) => s.providers)
  const selectedProviderId = useProviderStore((s) => s.selectedProviderId)
  const selectProvider = useProviderStore((s) => s.selectProvider)
  const userModelsByProvider = useProviderStore((s) => s.userModelsByProvider)
  const hasApiKey = useProviderStore((s) => s.hasApiKey)

  // Only show API providers (not local)
  const apiProviders = React.useMemo(
    () => providers.filter((p) => p.mode === 'remote-async'),
    [providers]
  )

  return (
    <ScrollArea className="h-full">
      <ItemGroup>
        {apiProviders.map((provider) => {
          const isSelected = provider.providerId === selectedProviderId
          const modelCount = userModelsByProvider[provider.providerId]?.length ?? 0
          const keyPresent = hasApiKey[provider.providerId] ?? false

          return (
            <Item
              key={provider.providerId}
              variant="outline"
              size="sm"
              role="listitem"
              tabIndex={0}
              className={cn(
                'cursor-pointer',
                isSelected
                  ? 'border-primary/40 bg-primary/10'
                  : 'hover:border-border hover:bg-muted/50'
              )}
              onClick={() => selectProvider(provider.providerId)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  selectProvider(provider.providerId)
                }
              }}
            >
              <ItemContent>
                <ItemTitle>
                  {statusDot(keyPresent)}
                  {provider.displayName ?? provider.providerId}
                </ItemTitle>
              </ItemContent>
              <ItemActions>
                {modelCount > 0 && (
                  <Badge variant="secondary" className="text-[10px] px-1.5">
                    {modelCount}
                  </Badge>
                )}
              </ItemActions>
            </Item>
          )
        })}

        {apiProviders.length === 0 && (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">
            No API providers configured
          </div>
        )}
      </ItemGroup>
    </ScrollArea>
  )
}
