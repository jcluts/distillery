import * as React from 'react'

import { Loader2, Plus, Check, Search, AlertCircle } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Item,
  ItemContent,
  ItemTitle,
  ItemDescription,
  ItemActions,
  ItemGroup
} from '@/components/ui/item'
import { useProviderStore } from '@/stores/provider-store'
import type { ProviderModel, SearchResultModel } from '@/types'

interface ModelBrowserProps {
  providerId: string
  browseMode: 'search' | 'list'
  addedModelIds: Set<string>
}

export function ModelBrowser({
  providerId,
  browseMode,
  addedModelIds
}: ModelBrowserProps): React.JSX.Element {
  if (browseMode === 'list') {
    return <ListBrowser providerId={providerId} addedModelIds={addedModelIds} />
  }
  return <SearchBrowser providerId={providerId} addedModelIds={addedModelIds} />
}

// =============================================================================
// Search-based browser (Fal, Replicate)
// =============================================================================

function SearchBrowser({
  providerId,
  addedModelIds
}: {
  providerId: string
  addedModelIds: Set<string>
}): React.JSX.Element {
  const searchModels = useProviderStore((s) => s.searchModels)
  const addUserModel = useProviderStore((s) => s.addUserModel)
  const searchResults = useProviderStore((s) => s.searchResults)
  const searchLoading = useProviderStore((s) => s.searchLoading)

  const [query, setQuery] = React.useState('')
  const debounceRef = React.useRef<number | null>(null)

  const results = searchResults[providerId]?.models ?? []
  const isLoading = searchLoading[providerId] ?? false

  // Debounced search
  React.useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current)
    if (!query.trim()) return

    debounceRef.current = window.setTimeout(() => {
      void searchModels(providerId, query.trim())
    }, 400)

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current)
    }
  }, [query, providerId, searchModels])

  // Reset search when switching providers
  React.useEffect(() => {
    setQuery('')
  }, [providerId])

  const handleAdd = async (model: SearchResultModel): Promise<void> => {
    // Fetch full model detail (with request schema) before persisting.
    // Fall back to a stub schema only when the detail call fails.
    let detailedModel: ProviderModel | null = null
    try {
      detailedModel = await window.api.providers.fetchModelDetail(providerId, model.modelId)
    } catch {
      // ignore — will fall back below
    }

    const providerModel: ProviderModel = detailedModel ?? {
      modelId: model.modelId,
      name: model.name,
      description: model.description,
      type: model.type,
      providerId,
      requestSchema: {
        properties: {
          prompt: {
            type: 'string',
            title: 'Prompt'
          }
        },
        required: ['prompt'],
        order: ['prompt']
      }
    }
    await addUserModel(providerId, providerModel)
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
        <Input
          placeholder="Search models…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-8"
        />
      </div>

      {isLoading && (
        <div className="space-y-2 pt-1">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      )}

      {!isLoading && query.trim() && results.length === 0 && (
        <div className="py-6 text-center text-xs text-muted-foreground">
          No models found for &ldquo;{query}&rdquo;
        </div>
      )}

      {!isLoading && results.length > 0 && (
        <ScrollArea className="max-h-[280px]">
          <ModelResultList
            models={results}
            addedModelIds={addedModelIds}
            onAdd={handleAdd}
          />
        </ScrollArea>
      )}

      {!query.trim() && !isLoading && (
        <div className="py-6 text-center text-xs text-muted-foreground">
          Type to search for models
        </div>
      )}
    </div>
  )
}

// =============================================================================
// List-based browser (Wavespeed)
// =============================================================================

function ListBrowser({
  providerId,
  addedModelIds
}: {
  providerId: string
  addedModelIds: Set<string>
}): React.JSX.Element {
  const listModels = useProviderStore((s) => s.listModels)
  const addUserModel = useProviderStore((s) => s.addUserModel)
  const listCache = useProviderStore((s) => s.listCache)
  const listLoading = useProviderStore((s) => s.listLoading)

  const [filter, setFilter] = React.useState('')

  const allModels = React.useMemo(
    () => listCache[providerId] ?? [],
    [listCache, providerId]
  )
  const isLoading = listLoading[providerId] ?? false

  // Load on mount
  React.useEffect(() => {
    void listModels(providerId)
  }, [providerId, listModels])

  // Reset filter when switching providers
  React.useEffect(() => {
    setFilter('')
  }, [providerId])

  const filtered = React.useMemo(() => {
    if (!filter.trim()) return allModels
    const q = filter.toLowerCase()
    return allModels.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.modelId.toLowerCase().includes(q) ||
        m.description?.toLowerCase().includes(q)
    )
  }, [allModels, filter])

  const handleAdd = async (model: ProviderModel | SearchResultModel): Promise<void> => {
    const providerModel: ProviderModel = {
      modelId: model.modelId,
      name: model.name,
      description: model.description,
      type: model.type,
      providerId,
      requestSchema:
        'requestSchema' in model
          ? model.requestSchema
          : {
              properties: {
                prompt: {
                  type: 'string',
                  title: 'Prompt'
                }
              },
              required: ['prompt'],
              order: ['prompt']
            }
    }
    await addUserModel(providerId, providerModel)
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
        <Input
          placeholder="Filter models…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="pl-8"
        />
      </div>

      {isLoading && (
        <div className="space-y-2 pt-1">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <div className="py-6 text-center text-xs text-muted-foreground">
          {allModels.length > 0 ? 'No models match your filter' : 'No models available'}
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <ScrollArea className="max-h-[280px]">
          <ModelResultList
            models={filtered}
            addedModelIds={addedModelIds}
            onAdd={handleAdd}
          />
        </ScrollArea>
      )}
    </div>
  )
}

// =============================================================================
// Shared model result list
// =============================================================================

function ModelResultList({
  models,
  addedModelIds,
  onAdd
}: {
  models: Array<SearchResultModel | ProviderModel>
  addedModelIds: Set<string>
  onAdd: (model: SearchResultModel | ProviderModel) => Promise<void>
}): React.JSX.Element {
  const [addingIds, setAddingIds] = React.useState<Set<string>>(new Set())
  const [errorIds, setErrorIds] = React.useState<Set<string>>(new Set())

  const handleAdd = async (model: SearchResultModel | ProviderModel): Promise<void> => {
    setAddingIds((prev) => new Set(prev).add(model.modelId))
    setErrorIds((prev) => {
      const next = new Set(prev)
      next.delete(model.modelId)
      return next
    })
    try {
      await onAdd(model)
    } catch {
      setErrorIds((prev) => new Set(prev).add(model.modelId))
    } finally {
      setAddingIds((prev) => {
        const next = new Set(prev)
        next.delete(model.modelId)
        return next
      })
    }
  }

  return (
    <ItemGroup>
      {models.map((model) => {
        const isAdded = addedModelIds.has(model.modelId)
        const isAdding = addingIds.has(model.modelId)
        const hasError = errorIds.has(model.modelId)

        return (
          <Item key={model.modelId} variant="outline" size="sm" className="hover:border-border hover:bg-muted/50">
            <ItemContent>
              <ItemTitle>{model.name}</ItemTitle>
              <ItemDescription>
                {model.modelId}
                {model.type && (
                  <Badge variant="secondary" className="ml-1.5 text-[10px] px-1">
                    {model.type}
                  </Badge>
                )}
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              {hasError ? (
                <Badge
                  variant="secondary"
                  className="gap-1 border-destructive/20 text-destructive bg-destructive/10 cursor-pointer"
                  title="Failed to add — click to retry"
                  onClick={() => void handleAdd(model)}
                >
                  <AlertCircle className="size-3" />
                  Retry
                </Badge>
              ) : isAdded ? (
                <Badge variant="secondary" className="gap-1 text-emerald-600">
                  <Check className="size-3" />
                  Added
                </Badge>
              ) : (
                <Button
                  variant="outline"
                  size="xs"
                  disabled={isAdding}
                  onClick={() => void handleAdd(model)}
                >
                  {isAdding ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Plus className="size-3" />
                  )}
                  Add
                </Button>
              )}
            </ItemActions>
          </Item>
        )
      })}
    </ItemGroup>
  )
}
