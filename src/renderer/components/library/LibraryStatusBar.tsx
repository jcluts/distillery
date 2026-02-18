import * as React from 'react'
import { Grid2X2, Image as ImageIcon } from 'lucide-react'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { THUMBNAIL_SIZE_MAX, THUMBNAIL_SIZE_MIN } from '@/lib/constants'
import { useLibraryStore } from '@/stores/library-store'
import { useUIStore, type ZoomLevel } from '@/stores/ui-store'

type SortOption = 'date_desc' | 'date_asc' | 'rating_desc' | 'rating_asc' | 'name_asc' | 'name_desc'

function getSortValue(field: string, dir: string): SortOption {
  if (field === 'rating' && dir === 'asc') return 'rating_asc'
  if (field === 'rating' && dir === 'desc') return 'rating_desc'
  if (field === 'file_name' && dir === 'asc') return 'name_asc'
  if (field === 'file_name' && dir === 'desc') return 'name_desc'
  if (dir === 'asc') return 'date_asc'
  return 'date_desc'
}

export function LibraryStatusBar(): React.JSX.Element {
  const thumbnailSize = useUIStore((s) => s.thumbnailSize)
  const setThumbnailSize = useUIStore((s) => s.setThumbnailSize)
  const viewMode = useUIStore((s) => s.viewMode)
  const setViewMode = useUIStore((s) => s.setViewMode)
  const loupeZoom = useUIStore((s) => s.loupeZoom)
  const setLoupeZoom = useUIStore((s) => s.setLoupeZoom)

  const total = useLibraryStore((s) => s.total)
  const items = useLibraryStore((s) => s.items)
  const focusedId = useLibraryStore((s) => s.focusedId)
  const selectedIds = useLibraryStore((s) => s.selectedIds)
  const sortField = useLibraryStore((s) => s.sortField)
  const sortDirection = useLibraryStore((s) => s.sortDirection)
  const setSortField = useLibraryStore((s) => s.setSortField)
  const setSortDirection = useLibraryStore((s) => s.setSortDirection)

  const sortValue = getSortValue(sortField, sortDirection)

  // Compute image counter text (V1-style: "3 / 42" in loupe, "42" in grid)
  const imageCount = total || items.length
  const counterText = React.useMemo(() => {
    if (viewMode === 'loupe' && focusedId) {
      const idx = items.findIndex((m) => m.id === focusedId)
      if (idx >= 0) return `${idx + 1} / ${imageCount}`
    }
    return `${imageCount}`
  }, [viewMode, focusedId, items, imageCount])

  return (
    <div className="flex shrink-0 items-center gap-3 border-t bg-sidebar px-3 py-2 text-xs">
      {/* Left: image counter + selection count */}
      <span className="tabular-nums text-muted-foreground">
        {counterText} images{selectedIds.size > 1 && ` · ${selectedIds.size} selected`}
      </span>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Center-right: sort, thumb slider (grid only), view mode */}
      <div className="flex items-center gap-3">
        <Select
          value={sortValue}
          onValueChange={(v) => {
            const next = v as SortOption
            if (next === 'date_asc') {
              setSortField('created_at')
              setSortDirection('asc')
            } else if (next === 'date_desc') {
              setSortField('created_at')
              setSortDirection('desc')
            } else if (next === 'rating_asc') {
              setSortField('rating')
              setSortDirection('asc')
            } else if (next === 'rating_desc') {
              setSortField('rating')
              setSortDirection('desc')
            } else if (next === 'name_asc') {
              setSortField('file_name')
              setSortDirection('asc')
            } else if (next === 'name_desc') {
              setSortField('file_name')
              setSortDirection('desc')
            }
          }}
        >
          <SelectTrigger className="w-[140px] text-xs">
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="date_desc">Date (newest)</SelectItem>
            <SelectItem value="date_asc">Date (oldest)</SelectItem>
            <SelectItem value="rating_desc">Rating (high)</SelectItem>
            <SelectItem value="rating_asc">Rating (low)</SelectItem>
            <SelectItem value="name_asc">Name (A-Z)</SelectItem>
            <SelectItem value="name_desc">Name (Z-A)</SelectItem>
          </SelectContent>
        </Select>

        {viewMode === 'loupe' && (
          <Select value={loupeZoom} onValueChange={(v) => setLoupeZoom(v as ZoomLevel)}>
            <SelectTrigger className="w-[100px] text-xs">
              <SelectValue placeholder="Zoom" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fit">Fit</SelectItem>
              <SelectItem value="actual">Actual (1:1)</SelectItem>
            </SelectContent>
          </Select>
        )}

        {viewMode === 'grid' && (
          <div className="flex w-28 items-center gap-1.5">
            <ImageIcon className="size-3 text-muted-foreground" />
            <Slider
              value={[thumbnailSize]}
              min={THUMBNAIL_SIZE_MIN}
              max={THUMBNAIL_SIZE_MAX}
              step={10}
              onValueChange={(v) => setThumbnailSize(v[0] ?? thumbnailSize)}
              className="flex-1"
            />
            <ImageIcon className="size-4 text-muted-foreground" />
          </div>
        )}

        <ToggleGroup
          type="single"
          value={viewMode}
          onValueChange={(v) => {
            if (v === 'grid' || v === 'loupe') setViewMode(v)
          }}
          className="gap-0"
        >
          <ToggleGroupItem value="grid" aria-label="Grid view" className="w-6 p-0">
            <Grid2X2 className="size-3.5" />
          </ToggleGroupItem>
          <ToggleGroupItem value="loupe" aria-label="Loupe view" className="w-6 p-0">
            <ImageIcon className="size-3.5" />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
    </div>
  )
}
