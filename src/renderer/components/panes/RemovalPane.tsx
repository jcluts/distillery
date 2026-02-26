import * as React from 'react'
import {
  Brush,
  Check,
  Eye,
  EyeOff,
  Loader2,
  RefreshCcw,
  RotateCcw,
  Trash2,
  X
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle
} from '@/components/ui/item'
import { SectionLabel } from '@/components/ui/section-label'
import { Slider } from '@/components/ui/slider'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useLibraryStore } from '@/stores/library-store'
import { useUIStore } from '@/stores/ui-store'
import { useRemovalStore } from '@/stores/removal-store'

const EMPTY_STRING_ARRAY: string[] = []

function formatTimestamp(iso: string): string {
  const date = new Date(iso)
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

export function RemovalPane(): React.JSX.Element {
  const focusedId = useLibraryStore((state) => state.focusedId)
  const focusedItem = useLibraryStore((state) => {
    if (!state.focusedId) return null
    return state.items.find((item) => item.id === state.focusedId) ?? null
  })
  const viewMode = useUIStore((state) => state.viewMode)

  const paintMode = useRemovalStore((state) => state.paintMode)
  const paintMediaId = useRemovalStore((state) => state.paintMediaId)
  const tool = useRemovalStore((state) => state.tool)
  const brushSizeNormalized = useRemovalStore((state) => state.brushSizeNormalized)
  const featherRadiusNormalized = useRemovalStore((state) => state.featherRadiusNormalized)
  const draftStrokes = useRemovalStore((state) => state.draftStrokes)
  const strokeHistoryIndex = useRemovalStore((state) => state.strokeHistoryIndex)
  const processingOperationIds = useRemovalStore((state) => state.processingOperationIds)
  const refreshingOperationIds = useRemovalStore((state) => state.refreshingOperationIds)
  const progressEvent = useRemovalStore((state) => state.progressEvent)
  const lastError = useRemovalStore((state) => state.lastError)

  const data = useRemovalStore((state) => (focusedId ? state.dataByMediaId[focusedId] ?? null : null))
  const staleOperationIds = useRemovalStore((state) =>
    focusedId ? state.staleOperationIdsByMediaId[focusedId] ?? EMPTY_STRING_ARRAY : EMPTY_STRING_ARRAY
  )

  const loadData = useRemovalStore((state) => state.loadData)
  const enterPaintMode = useRemovalStore((state) => state.enterPaintMode)
  const cancelPaintMode = useRemovalStore((state) => state.cancelPaintMode)
  const setTool = useRemovalStore((state) => state.setTool)
  const setBrushSizeNormalized = useRemovalStore((state) => state.setBrushSizeNormalized)
  const setFeatherRadiusNormalized = useRemovalStore((state) => state.setFeatherRadiusNormalized)
  const undoStroke = useRemovalStore((state) => state.undoStroke)
  const clearDraftStrokes = useRemovalStore((state) => state.clearDraftStrokes)
  const applyDraft = useRemovalStore((state) => state.applyDraft)
  const toggleOperation = useRemovalStore((state) => state.toggleOperation)
  const deleteOperation = useRemovalStore((state) => state.deleteOperation)
  const refreshOperation = useRemovalStore((state) => state.refreshOperation)
  const refreshAllStale = useRemovalStore((state) => state.refreshAllStale)

  React.useEffect(() => {
    if (focusedId && focusedItem?.media_type === 'image') {
      void loadData(focusedId)
    }
  }, [focusedId, focusedItem?.media_type, loadData])

  if (!focusedItem) {
    return (
      <div className="flex items-center justify-center px-4 py-8 text-sm text-muted-foreground">
        Select an image to remove objects
      </div>
    )
  }

  if (focusedItem.media_type !== 'image') {
    return (
      <div className="flex items-center justify-center px-4 py-8 text-sm text-muted-foreground">
        Removals are available for images only
      </div>
    )
  }

  if (viewMode !== 'loupe') {
    return (
      <div className="flex items-center justify-center px-4 py-8 text-sm text-muted-foreground">
        Open an image in loupe view to use removals
      </div>
    )
  }

  const staleIds = new Set(staleOperationIds)
  const staleEnabledCount = (data?.operations ?? []).filter(
    (operation) => operation.enabled && staleIds.has(operation.id)
  ).length

  const isPaintTarget = paintMode && paintMediaId === focusedItem.id
  const canUndo = strokeHistoryIndex > 0
  const hasDraft = draftStrokes.length > 0

  const brushSizePercent = Math.round(brushSizeNormalized * 100)
  const featherPercent = Math.round(featherRadiusNormalized * 100)

  const mediaProgress =
    progressEvent && progressEvent.mediaId === focusedItem.id ? progressEvent : null

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <SectionLabel>Mode</SectionLabel>
        <ToggleGroup
          type="single"
          value={tool}
          onValueChange={(value) => {
            if (value === 'paint' || value === 'erase') {
              setTool(value)
            }
          }}
          className="justify-start"
        >
          <ToggleGroupItem value="paint" size="sm">Paint</ToggleGroupItem>
          <ToggleGroupItem value="erase" size="sm">Erase</ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <SectionLabel className="text-xs">Brush Size</SectionLabel>
          <span>{brushSizePercent}%</span>
        </div>
        <Slider
          min={0.4}
          max={25}
          step={0.1}
          value={[brushSizeNormalized * 100]}
          onValueChange={(value) => {
            const next = (value[0] ?? brushSizePercent) / 100
            setBrushSizeNormalized(next)
          }}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <SectionLabel className="text-xs">Feather</SectionLabel>
          <span>{featherPercent}%</span>
        </div>
        <Slider
          min={0}
          max={20}
          step={0.1}
          value={[featherRadiusNormalized * 100]}
          onValueChange={(value) => {
            const next = (value[0] ?? featherPercent) / 100
            setFeatherRadiusNormalized(next)
          }}
        />
      </div>

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={undoStroke}
          disabled={!isPaintTarget || !canUndo}
        >
          <RotateCcw className="mr-1 size-3.5" />
          Undo
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={clearDraftStrokes}
          disabled={!isPaintTarget || !hasDraft}
        >
          <Trash2 className="mr-1 size-3.5" />
          Clear
        </Button>
      </div>

      <div>
        {!isPaintTarget ? (
          <Button type="button" variant="outline" className="w-full" onClick={() => void enterPaintMode(focusedItem.id)}>
            <Brush className="mr-2 size-4" />
            Paint Mask
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button type="button" className="flex-1" disabled={!hasDraft} onClick={() => void applyDraft()}>
              <Check className="mr-2 size-4" />
              Apply
            </Button>
            <Button type="button" variant="outline" className="flex-1" onClick={cancelPaintMode}>
              <X className="mr-2 size-4" />
              Cancel
            </Button>
          </div>
        )}
      </div>

      {mediaProgress && mediaProgress.phase !== 'complete' && mediaProgress.phase !== 'error' && (
        <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Loader2 className="size-3.5 animate-spin" />
            <span>{mediaProgress.message ?? `Phase: ${mediaProgress.phase}`}</span>
          </div>
        </div>
      )}

      {lastError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {lastError}
        </div>
      )}

      {(data?.operations.length ?? 0) > 0 && (
        <div className="space-y-2">
          <SectionLabel>Operations</SectionLabel>
          <ItemGroup>
            {data!.operations.map((operation, index) => {
              const isStale = staleIds.has(operation.id)
              const isRefreshing = refreshingOperationIds.has(operation.id)
              const isProcessing = processingOperationIds.has(operation.id)
              const status = isRefreshing
                ? 'Refreshing'
                : isProcessing
                  ? 'Processing'
                  : isStale
                    ? 'Needs Refresh'
                    : operation.enabled
                      ? 'Applied'
                      : 'Hidden'

              return (
                <Item key={operation.id} variant="outline" size="xs" className="gap-2">
                  <ItemContent>
                    <ItemTitle>
                      Removal {index + 1}
                      <span className="text-muted-foreground font-normal">· {status}</span>
                    </ItemTitle>
                    <ItemDescription>{formatTimestamp(operation.timestamp)}</ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      onClick={() => void toggleOperation(focusedItem.id, operation.id, !operation.enabled)}
                      aria-label={operation.enabled ? 'Hide removal' : 'Show removal'}
                    >
                      {operation.enabled ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                    </Button>

                    {isStale && (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        disabled={isRefreshing || isProcessing}
                        onClick={() => void refreshOperation(focusedItem.id, operation.id)}
                        aria-label="Refresh removal"
                      >
                        <RefreshCcw className={isRefreshing || isProcessing ? 'size-4 animate-spin' : 'size-4'} />
                      </Button>
                    )}

                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      onClick={() => void deleteOperation(focusedItem.id, operation.id)}
                      aria-label="Delete removal"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </ItemActions>
                </Item>
              )
            })}
          </ItemGroup>

          {staleEnabledCount > 0 && (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => void refreshAllStale(focusedItem.id)}
            >
              Refresh All ({staleEnabledCount})
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
