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
            <Star className={cn('size-4', active && 'fill-current')} />
          </button>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// KeywordEditor
// ---------------------------------------------------------------------------

function KeywordEditor({
  mediaId,
  keywords,
  onChanged
}: {
  mediaId: string
  keywords: string[]
  onChanged: () => void
}): React.JSX.Element {
  const [inputValue, setInputValue] = React.useState('')

  const addKeyword = async (raw: string): Promise<void> => {
    const keyword = raw.trim().toLowerCase()
    if (!keyword || keywords.includes(keyword)) {
      setInputValue('')
      return
    }
    await window.api.keywords.addToMedia(mediaId, keyword)
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
            <Badge key={kw} variant="secondary" className="gap-1 pr-1 text-xs">
              {kw}
              <button
                type="button"
                className="ml-0.5 rounded-sm p-0.5 hover:bg-muted-foreground/20"
                onClick={() => void removeKeyword(kw)}
                aria-label={`Remove keyword ${kw}`}
              >
                <X className="size-3" />
              </button>
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
  const updateItem = useLibraryStore((s) => s.updateItem)
  const buildQuery = useLibraryStore((s) => s.buildQuery)
  const setItems = useLibraryStore((s) => s.setItems)
  const removeItems = useLibraryStore((s) => s.removeItems)
  const selectSingle = useLibraryStore((s) => s.selectSingle)

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

  const refreshAfterKeywordChange = React.useCallback(async () => {
    if (!media?.id) return
    await fetchKeywords(media.id)
    // Re-query library in case search filter is active on keywords
    const page = await window.api.getMedia(buildQuery())
    setItems(page)
  }, [media?.id, fetchKeywords, buildQuery, setItems])

  // -- Media file actions --

  const handleShowInFolder = React.useCallback(() => {
    if (media?.id) window.api.showMediaInFolder(media.id)
  }, [media?.id])

  const handleOpenInApp = React.useCallback(() => {
    if (media?.id) window.api.openMediaInApp(media.id)
  }, [media?.id])

  const handleCopyToClipboard = React.useCallback(() => {
    if (media?.id) window.api.copyMediaToClipboard(media.id)
  }, [media?.id])

  const executeDelete = React.useCallback(async () => {
    if (!media?.id) return
    // Determine next item to select before removing
    const idx = items.findIndex((m) => m.id === media.id)
    const nextItem = items[idx + 1] ?? items[idx - 1] ?? null

    await window.api.deleteMedia([media.id])
    removeItems([media.id])

    if (nextItem) {
      selectSingle(nextItem.id)
    }

    const page = await window.api.getMedia(buildQuery())
    setItems(page)
  }, [media?.id, items, removeItems, selectSingle, buildQuery, setItems])

  const handleDelete = React.useCallback(async () => {
    if (!media?.id) return
    const settings = await window.api.getSettings()
    if (settings.confirm_before_delete) {
      setDeleteDialogOpen(true)
    } else {
      void executeDelete()
    }
  }, [media?.id, executeDelete])

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <SectionLabel>Rating</SectionLabel>
        <StarRating
          rating={media?.rating ?? 0}
          onChange={(r) => {
            if (!media) return
            void persistUpdate(media.id, { rating: r })
          }}
        />
      </div>

      <div className="space-y-2">
        <SectionLabel>Status</SectionLabel>
        <ToggleGroup
          type="single"
          value={currentStatus}
          onValueChange={(v: string) => {
            if (!media || !v) return
            if (v === 'unmarked') void persistUpdate(media.id, { status: null })
            else if (v === 'selected' || v === 'rejected')
              void persistUpdate(media.id, { status: v as MediaStatus })
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
                <CircleCheck className="size-6" />
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
                <CircleX className="size-6" />
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
                className={cn(
                  'text-muted-foreground',
                  currentStatus === 'unmarked' && 'bg-muted text-foreground ring-1 ring-border'
                )}
              >
                <CircleMinus className="size-6" />
              </ToggleGroupItem>
            </TooltipTrigger>
            <TooltipContent side="bottom">Clear</TooltipContent>
          </Tooltip>
        </ToggleGroup>
      </div>

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
              value: media?.file_size ? `${(media.file_size / (1024 * 1024)).toFixed(2)} MB` : '—'
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

      {media && (
        <>
          <div className="space-y-2">
            <SectionLabel>Actions</SectionLabel>
            <div className="flex flex-wrap gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon" onClick={handleShowInFolder}>
                    <FolderOpen className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Show in folder</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon" onClick={handleOpenInApp}>
                    <ExternalLink className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Open in default app</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon" onClick={handleCopyToClipboard}>
                    <ClipboardCopy className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Copy to clipboard</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="text-destructive hover:bg-destructive/10"
                    onClick={() => void handleDelete()}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Delete image</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </>
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete image?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the file from disk. This action cannot be undone.
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
          />
        ) : (
          <div className="text-xs text-muted-foreground">No selection</div>
        )}
      </div>
    </div>
  )
}
