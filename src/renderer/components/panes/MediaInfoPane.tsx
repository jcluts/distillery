import * as React from 'react'
import {
  CircleCheck,
  CircleMinus,
  CircleX,
  ClipboardCopy,
  ExternalLink,
  FolderOpen,
  Star,
  Trash2,
  X
} from 'lucide-react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { SectionLabel } from '@/components/ui/section-label'
import { InfoTable } from '@/components/ui/info-table'
import { useLibraryStore } from '@/stores/library-store'
import { cn } from '@/lib/utils'
import type { MediaStatus, MediaUpdate } from '@/types'

// ---------------------------------------------------------------------------
// StarRating
// ---------------------------------------------------------------------------

function StarRating({
  rating,
  onChange
}: {
  rating: number
  onChange: (rating: number) => void
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 5 }).map((_, i) => {
        const value = i + 1
        const active = value <= rating
        return (
          <button
            key={value}
            type="button"
            className={cn(
              'rounded-sm p-1 transition-colors hover:bg-accent',
              active ? 'text-primary' : 'text-muted-foreground'
            )}
            onClick={() => onChange(value)}
            aria-label={`Set rating ${value}`}
          >
            <Star className={cn('size-5', active && 'fill-current')} />
          </button>
        )
      })}
      {rating > 0 && (
        <button
          type="button"
          className="ml-1 rounded-sm p-1 text-muted-foreground transition-colors hover:bg-accent"
          onClick={() => onChange(0)}
          aria-label="Clear rating"
        >
          <X className="size-5" />
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// KeywordEditor
// ---------------------------------------------------------------------------

function KeywordEditor({
  mediaId,
  keywords,
  onChanged,
  onAdd,
  hideRemove
}: {
  mediaId: string
  keywords: string[]
  onChanged: () => void
  onAdd?: (keyword: string) => Promise<void>
  hideRemove?: boolean
}): React.JSX.Element {
  const [inputValue, setInputValue] = React.useState('')

  const addKeyword = async (raw: string): Promise<void> => {
    const keyword = raw.trim().toLowerCase()
    if (!keyword || keywords.includes(keyword)) {
      setInputValue('')
      return
    }
    if (onAdd) {
      await onAdd(keyword)
    } else {
      await window.api.keywords.addToMedia(mediaId, keyword)
    }
    setInputValue('')
    onChanged()
  }

  const removeKeyword = async (keyword: string): Promise<void> => {
    await window.api.keywords.removeFromMedia(mediaId, keyword)
    onChanged()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      void addKeyword(inputValue)
    } else if (e.key === 'Backspace' && inputValue === '' && keywords.length > 0) {
      void removeKeyword(keywords[keywords.length - 1])
    }
  }

  return (
    <div className="space-y-2">
      {keywords.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {keywords.map((kw) => (
            <Badge key={kw} variant="secondary" className={cn('text-xs', !hideRemove && 'gap-1 pr-1')}>
              {kw}
              {!hideRemove && (
                <button
                  type="button"
                  className="ml-0.5 rounded-sm p-0.5 hover:bg-muted-foreground/20"
                  onClick={() => void removeKeyword(kw)}
                  aria-label={`Remove keyword ${kw}`}
                >
                  <X className="size-3" />
                </button>
              )}
            </Badge>
          ))}
        </div>
      )}
      <Input
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          if (inputValue.trim()) void addKeyword(inputValue)
        }}
        placeholder="Add keyword…"
        className="h-7 text-xs"
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// MediaInfoPane
// ---------------------------------------------------------------------------

export function MediaInfoPane(): React.JSX.Element {
  const items = useLibraryStore((s) => s.items)
  const focusedId = useLibraryStore((s) => s.focusedId)
  const selectedIds = useLibraryStore((s) => s.selectedIds)
  const updateItem = useLibraryStore((s) => s.updateItem)
  const buildQuery = useLibraryStore((s) => s.buildQuery)
  const setItems = useLibraryStore((s) => s.setItems)
  const removeItems = useLibraryStore((s) => s.removeItems)
  const selectSingle = useLibraryStore((s) => s.selectSingle)
  const setSelection = useLibraryStore((s) => s.setSelection)

  const isMulti = selectedIds.size > 1
  const media = focusedId ? (items.find((m) => m.id === focusedId) ?? null) : null
  const currentStatus = media?.status ?? 'unmarked'
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false)

  // Keyword state fetched from the normalized tables
  const [keywords, setKeywords] = React.useState<string[]>([])

  const fetchKeywords = React.useCallback(async (mediaId: string) => {
    const kws = await window.api.keywords.getForMedia(mediaId)
    setKeywords(kws)
  }, [])

  React.useEffect(() => {
    if (media?.id) {
      void fetchKeywords(media.id)
    } else {
      setKeywords([])
    }
  }, [media?.id, fetchKeywords])

  const persistUpdate = React.useCallback(
    async (id: string, updates: MediaUpdate) => {
      updateItem(id, updates)
      try {
        await window.api.updateMedia(id, updates)
      } finally {
        const page = await window.api.getMedia(buildQuery())
        setItems(page)
      }
    },
    [buildQuery, setItems, updateItem]
  )

  const persistUpdateBulk = React.useCallback(
    async (ids: string[], updates: MediaUpdate) => {
      for (const id of ids) updateItem(id, updates)
      try {
        await Promise.all(ids.map((id) => window.api.updateMedia(id, updates)))
      } finally {
        const page = await window.api.getMedia(buildQuery())
        setItems(page)
      }
    },
    [buildQuery, setItems, updateItem]
  )

  const refreshAfterKeywordChange = React.useCallback(async () => {
    if (!media?.id) return
    await fetchKeywords(media.id)
    const page = await window.api.getMedia(buildQuery())
    setItems(page)
  }, [media?.id, fetchKeywords, buildQuery, setItems])

  // Bulk keyword add: add a keyword to all selected items
  const addKeywordToAll = React.useCallback(
    async (keyword: string) => {
      const ids = [...selectedIds]
      await Promise.all(ids.map((id) => window.api.keywords.addToMedia(id, keyword)))
      if (media?.id) await fetchKeywords(media.id)
      const page = await window.api.getMedia(buildQuery())
      setItems(page)
    },
    [selectedIds, media?.id, fetchKeywords, buildQuery, setItems]
  )

  // -- Media file actions --

  const handleShowInFolder = React.useCallback(() => {
    if (media?.id) window.api.showMediaInFolder(media.id)
  }, [media?.id])

  const handleOpenInApp = React.useCallback(() => {
    if (isMulti) {
      for (const id of selectedIds) window.api.openMediaInApp(id)
    } else if (media?.id) {
      window.api.openMediaInApp(media.id)
    }
  }, [media?.id, isMulti, selectedIds])

  const handleCopyToClipboard = React.useCallback(() => {
    if (media?.id) window.api.copyMediaToClipboard(media.id)
  }, [media?.id])

  const executeDelete = React.useCallback(async () => {
    const idsToDelete = isMulti ? [...selectedIds] : media?.id ? [media.id] : []
    if (idsToDelete.length === 0) return

    // Determine next item to select after removal
    const deleteSet = new Set(idsToDelete)
    const remaining = items.filter((m) => !deleteSet.has(m.id))
    const nextItem = remaining[0] ?? null

    await window.api.deleteMedia(idsToDelete)
    removeItems(idsToDelete)

    if (nextItem) {
      selectSingle(nextItem.id)
    } else {
      setSelection(new Set())
    }

    const page = await window.api.getMedia(buildQuery())
    setItems(page)
  }, [isMulti, selectedIds, media?.id, items, removeItems, selectSingle, setSelection, buildQuery, setItems])

  const handleDelete = React.useCallback(async () => {
    const hasItems = isMulti ? selectedIds.size > 0 : !!media?.id
    if (!hasItems) return
    const settings = await window.api.getSettings()
    if (settings.confirm_before_delete) {
      setDeleteDialogOpen(true)
    } else {
      void executeDelete()
    }
  }, [isMulti, selectedIds, media?.id, executeDelete])

  const deleteCount = isMulti ? selectedIds.size : 1

  return (
    <div className="space-y-4">
      {isMulti && (
        <div className="text-sm font-medium text-muted-foreground">
          {selectedIds.size} items selected
        </div>
      )}

      <div className="space-y-2">
        <SectionLabel>Rating</SectionLabel>
        <StarRating
          rating={media?.rating ?? 0}
          onChange={(r) => {
            if (isMulti) {
              void persistUpdateBulk([...selectedIds], { rating: r })
            } else if (media) {
              void persistUpdate(media.id, { rating: r })
            }
          }}
        />
      </div>

      <div className="space-y-2">
        <SectionLabel>Status</SectionLabel>
        <ToggleGroup
          type="single"
          value={currentStatus}
          onValueChange={(v: string) => {
            if (!v) return
            const updates: MediaUpdate =
              v === 'unmarked' ? { status: null } : { status: v as MediaStatus }
            if (isMulti) {
              void persistUpdateBulk([...selectedIds], updates)
            } else if (media) {
              void persistUpdate(media.id, updates)
            }
          }}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <ToggleGroupItem
                value="selected"
                size="sm"
                aria-label="Selected" 
                className={cn(
                  'text-muted-foreground',
                  currentStatus === 'selected' &&
                    'bg-primary/10 text-primary ring-1 ring-primary/30'
                )}
              >
                <CircleCheck className="size-5" />
              </ToggleGroupItem>
            </TooltipTrigger>
            <TooltipContent side="bottom">Selected</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <ToggleGroupItem
                value="rejected"
                size="sm"
                aria-label="Rejected"
                className={cn(
                  'text-muted-foreground',
                  currentStatus === 'rejected' &&
                    'bg-destructive/10 text-destructive ring-1 ring-destructive/30'
                )}
              >
                <CircleX className="size-5" />
              </ToggleGroupItem>
            </TooltipTrigger>
            <TooltipContent side="bottom">Rejected</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <ToggleGroupItem
                value="unmarked"
                size="sm"
                aria-label="Clear status"
                className="text-muted-foreground"
              >
                <CircleMinus className="size-5" />
              </ToggleGroupItem>
            </TooltipTrigger>
            <TooltipContent side="bottom">Clear</TooltipContent>
          </Tooltip>
        </ToggleGroup>
      </div>

      {!isMulti && (
        <div className="space-y-2">
          <SectionLabel>File Info</SectionLabel>
          <InfoTable
            items={[
              { label: 'Name', value: media?.file_name ?? '—' },
              {
                label: 'Date',
                value: media?.created_at ? new Date(media.created_at).toLocaleString() : '—'
              },
              {
                label: 'Size',
                value: media?.file_size
                  ? `${(media.file_size / (1024 * 1024)).toFixed(2)} MB`
                  : '—'
              },
              {
                label: 'Format',
                value: media?.file_name
                  ? (media.file_name.split('.').pop()?.toUpperCase() ?? '—')
                  : '—'
              },
              {
                label: 'Dimensions',
                value: media?.width && media?.height ? `${media.width} × ${media.height}` : '—'
              },
              {
                label: 'Megapixels',
                value:
                  media?.width && media?.height
                    ? `${((media.width * media.height) / 1_000_000).toFixed(1)} MP`
                    : '—'
              },
              { label: 'Origin', value: media?.origin ?? '—' }
            ]}
          />
        </div>
      )}

      {(media || isMulti) && (
        <>
          <div className="space-y-2">
            <SectionLabel>Actions</SectionLabel>
            <div className="flex flex-wrap gap-1">
              {!isMulti && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="icon-lg" onClick={handleShowInFolder}>
                      <FolderOpen />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Show in folder</TooltipContent>
                </Tooltip>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon-lg" onClick={handleOpenInApp}>
                    <ExternalLink />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Open in default app</TooltipContent>
              </Tooltip>
              {!isMulti && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="icon-lg" onClick={handleCopyToClipboard}>
                      <ClipboardCopy />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Copy to clipboard</TooltipContent>
                </Tooltip>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon-lg"
                    className="text-destructive hover:bg-destructive/10"
                    onClick={() => void handleDelete()}
                  >
                    <Trash2 />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {isMulti ? `Delete ${deleteCount} images` : 'Delete image'}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </>
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isMulti ? `Delete ${deleteCount} images?` : 'Delete image?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isMulti
                ? `This will permanently delete ${deleteCount} files from disk. This action cannot be undone.`
                : 'This will permanently delete the file from disk. This action cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void executeDelete()}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="space-y-2">
        <SectionLabel>Keywords</SectionLabel>
        {media ? (
          <KeywordEditor
            mediaId={media.id}
            keywords={keywords}
            onChanged={refreshAfterKeywordChange}
            onAdd={isMulti ? addKeywordToAll : undefined}
            hideRemove={isMulti}
          />
        ) : (
          <div className="text-xs text-muted-foreground">No selection</div>
        )}
      </div>
    </div>
  )
}
