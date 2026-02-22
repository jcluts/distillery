import * as React from 'react'
import { Check, Loader2, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
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
    <button
      type="button"
      onClick={onActivate}
      className={cn(
        'flex w-full items-start gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors',
        isActive
          ? 'border-primary/40 bg-primary/10'
          : 'border-transparent hover:border-border hover:bg-muted/50'
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {isActive && <Check className="size-3.5 text-primary shrink-0" />}
          <span className="font-medium truncate">{variant.model_name}</span>
          <span className="text-muted-foreground">{variant.scale_factor}×</span>
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {formatDimensions(variant.width, variant.height)}
          {variant.file_size ? ` · ${formatFileSize(variant.file_size)}` : ''}
          {' · '}
          {formatDate(variant.created_at)}
        </div>
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="shrink-0 rounded-sm p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
            aria-label="Delete variant"
          >
            <Trash2 className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="left">Delete variant</TooltipContent>
      </Tooltip>
    </button>
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
  const progressPhase = useUpscaleStore((s) => s.progressPhase)
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
    <div className="flex flex-col gap-4 px-3 py-3">
      {/* Model selector */}
      <div className="space-y-1.5">
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
      <div className="space-y-1.5">
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
      <Button
        onClick={() => void submit(focusedItem.id)}
        disabled={!selectedModelId || isUpscaling}
        className="w-full"
      >
        {isUpscaling ? (
          <>
            <Loader2 className="size-4 animate-spin mr-2" />
            {progressPhase === 'preparing'
              ? 'Preparing…'
              : progressPhase === 'upscaling'
                ? 'Upscaling…'
                : progressPhase === 'saving'
                  ? 'Saving…'
                  : 'Processing…'}
          </>
        ) : (
          'Upscale'
        )}
      </Button>

      {/* Variants list */}
      {(variants.length > 0 || activeVariantId !== null) && (
        <div className="space-y-1.5">
          <SectionLabel>Variants</SectionLabel>
          <div className="flex flex-col gap-1">
            {/* Original entry */}
            <button
              type="button"
              onClick={() => void setActive(focusedItem.id, null)}
              className={cn(
                'flex w-full items-center gap-1.5 rounded-md border px-3 py-2 text-left text-sm transition-colors',
                activeVariantId === null
                  ? 'border-primary/40 bg-primary/10'
                  : 'border-transparent hover:border-border hover:bg-muted/50'
              )}
            >
              {activeVariantId === null && <Check className="size-3.5 text-primary shrink-0" />}
              <span className="font-medium">Original</span>
              {focusedItem.width && focusedItem.height && (
                <span className="text-xs text-muted-foreground ml-auto">
                  {formatDimensions(focusedItem.width, focusedItem.height)}
                </span>
              )}
            </button>

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
          </div>
        </div>
      )}
    </div>
  )
}
