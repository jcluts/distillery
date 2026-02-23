import * as React from 'react'
import { Check, Loader2, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle
} from '@/components/ui/item'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { SectionLabel } from '@/components/ui/section-label'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { UpscaleStatus } from '@/components/upscale/UpscaleStatus'
import { useUpscaleStore } from '@/stores/upscale-store'
import { useLibraryStore } from '@/stores/library-store'
import { cn } from '@/lib/utils'
import type { UpscaleVariant } from '@/types'

function formatDimensions(w: number, h: number): string {
  return `${w} × ${h}`
}

function formatFileSize(bytes: number | null): string {
  if (bytes === null) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function VariantItem({
  variant,
  isActive,
  onActivate,
  onDelete
}: {
  variant: UpscaleVariant
  isActive: boolean
  onActivate: () => void
  onDelete: () => void
}): React.JSX.Element {
  return (
    <Item
      variant="outline"
      size="xs"
      className={cn(
        'cursor-pointer',
        isActive ? 'border-primary/40 bg-primary/10' : 'hover:border-border hover:bg-muted/50'
      )}
      onClick={onActivate}
    >
      <ItemContent>
        <ItemTitle>
          {isActive && <Check className="size-3.5 text-primary shrink-0" />}
          {variant.model_name}
          <span className="text-muted-foreground font-normal">{variant.scale_factor}×</span>
        </ItemTitle>
        <ItemDescription>
          {formatDimensions(variant.width, variant.height)}
          {variant.file_size ? ` · ${formatFileSize(variant.file_size)}` : ''}
          {' · '}
          {formatDate(variant.created_at)}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon-sm"
              className="bg-background text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              onClick={(e) => {
                e.stopPropagation()
                onDelete()
              }}
              aria-label="Delete variant"
            >
              <Trash2 />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">Delete variant</TooltipContent>
        </Tooltip>
      </ItemActions>
    </Item>
  )
}

export function UpscalePane(): React.JSX.Element {
  const focusedId = useLibraryStore((s) => s.focusedId)
  const focusedItem = useLibraryStore((s) => {
    if (!s.focusedId) return null
    return s.items.find((m) => m.id === s.focusedId) ?? null
  })

  const models = useUpscaleStore((s) => s.models)
  const selectedModelId = useUpscaleStore((s) => s.selectedModelId)
  const selectedScale = useUpscaleStore((s) => s.selectedScale)
  const variants = useUpscaleStore((s) => s.variants)
  const activeVariantId = useUpscaleStore((s) => s.activeVariantId)
  const isUpscaling = useUpscaleStore((s) => s.isUpscaling)
  const setSelectedModelId = useUpscaleStore((s) => s.setSelectedModelId)
  const setSelectedScale = useUpscaleStore((s) => s.setSelectedScale)
  const submit = useUpscaleStore((s) => s.submit)
  const setActive = useUpscaleStore((s) => s.setActive)
  const deleteVariant = useUpscaleStore((s) => s.deleteVariant)
  const loadUpscaleData = useUpscaleStore((s) => s.loadUpscaleData)
  const loadModels = useUpscaleStore((s) => s.loadModels)

  // Load models on mount
  React.useEffect(() => {
    void loadModels()
  }, [loadModels])

  // Load upscale data when focused item changes
  React.useEffect(() => {
    if (focusedId) {
      void loadUpscaleData(focusedId)
    }
  }, [focusedId, loadUpscaleData])

  // Get supported scales for selected model
  const selectedModel = models.find((m) => m.id === selectedModelId)
  const supportedScales = selectedModel?.supportedScales ?? [2, 3, 4]

  // Ensure selectedScale is valid for current model
  React.useEffect(() => {
    if (selectedModel && !selectedModel.supportedScales.includes(selectedScale)) {
      setSelectedScale(selectedModel.supportedScales[selectedModel.supportedScales.length - 1])
    }
  }, [selectedModel, selectedScale, setSelectedScale])

  if (!focusedItem) {
    return (
      <div className="flex items-center justify-center px-4 py-8 text-sm text-muted-foreground">
        Select an image to upscale
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Model selector */}
      <div className="space-y-2">
        <SectionLabel>Model</SectionLabel>
        <Select
          value={selectedModelId ?? ''}
          onValueChange={setSelectedModelId}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select model">
              {selectedModel?.name}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {models.map((m) => (
              <SelectItem key={m.id} value={m.id} className="items-start">
                <div>
                  <div>{m.name}</div>
                  <div className="text-xs text-muted-foreground">{m.description}</div>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Scale factor */}
      <div className="space-y-2">
        <SectionLabel>Scale Factor</SectionLabel>
        <ToggleGroup
          type="single"
          value={String(selectedScale)}
          onValueChange={(val) => {
            if (val) setSelectedScale(Number(val))
          }}
          className="justify-start"
        >
          {supportedScales.map((s) => (
            <ToggleGroupItem key={s} value={String(s)} size="sm">
              {s}×
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {/* Upscale button */}
      <div className="space-y-2">
        <Button
          onClick={() => void submit(focusedItem.id)}
          disabled={!selectedModelId || isUpscaling}
          className="w-full"
        >
          {isUpscaling ? (
            <>
              <Loader2 className="size-4 animate-spin mr-2" />
              Upscaling…
            </>
          ) : (
            'Upscale'
          )}
        </Button>
      </div>

      <UpscaleStatus />

      {/* Variants list */}
      {(variants.length > 0 || activeVariantId !== null) && (
        <div className="space-y-2">
          <SectionLabel>Variants</SectionLabel>
          <ItemGroup>
            {/* Original entry */}
            <Item
              size="xs"
              variant="outline"
              className={cn(
                'cursor-pointer',
                activeVariantId === null
                  ? 'border-primary/40 bg-primary/10'
                  : 'hover:border-border hover:bg-muted/50'
              )}
              onClick={() => void setActive(focusedItem.id, null)}
            >
              <ItemContent>
                <ItemTitle>
                  {activeVariantId === null && <Check className="size-3.5 text-primary shrink-0" />}
                  Original
                </ItemTitle>
              </ItemContent>
              {focusedItem.width && focusedItem.height && (
                <ItemActions>
                  <span className="text-xs text-muted-foreground">
                    {formatDimensions(focusedItem.width, focusedItem.height)}
                  </span>
                </ItemActions>
              )}
            </Item>

            {/* Variant entries */}
            {variants.map((v) => (
              <VariantItem
                key={v.id}
                variant={v}
                isActive={v.id === activeVariantId}
                onActivate={() => void setActive(focusedItem.id, v.id)}
                onDelete={() => void deleteVariant(v.id, focusedItem.id)}
              />
            ))}
          </ItemGroup>
        </div>
      )}
    </div>
  )
}
