import * as React from 'react'

import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Separator } from '@/components/ui/separator'
import { useLibraryStore } from '@/stores/library-store'
import { cn } from '@/lib/utils'

type SortOption =
  | 'date_desc'
  | 'date_asc'
  | 'rating_desc'
  | 'rating_asc'
  | 'name_asc'
  | 'name_desc'

function getSortValue(field: string, dir: string): SortOption {
  if (field === 'rating' && dir === 'asc') return 'rating_asc'
  if (field === 'rating' && dir === 'desc') return 'rating_desc'
  if (field === 'file_name' && dir === 'asc') return 'name_asc'
  if (field === 'file_name' && dir === 'desc') return 'name_desc'
  if (dir === 'asc') return 'date_asc'
  return 'date_desc'
}

export function FilterBar(): React.JSX.Element {
  const ratingFilter = useLibraryStore((s) => s.ratingFilter)
  const statusFilter = useLibraryStore((s) => s.statusFilter)
  const searchQuery = useLibraryStore((s) => s.searchQuery)
  const sortField = useLibraryStore((s) => s.sortField)
  const sortDirection = useLibraryStore((s) => s.sortDirection)
  const total = useLibraryStore((s) => s.total)
  const items = useLibraryStore((s) => s.items)

  const setRatingFilter = useLibraryStore((s) => s.setRatingFilter)
  const setStatusFilter = useLibraryStore((s) => s.setStatusFilter)
  const setSearchQuery = useLibraryStore((s) => s.setSearchQuery)
  const setSortField = useLibraryStore((s) => s.setSortField)
  const setSortDirection = useLibraryStore((s) => s.setSortDirection)

  const sortValue = getSortValue(sortField, sortDirection)

  return (
    <div className="flex items-center gap-3 border-b bg-background px-3 py-2">
      <div className="flex items-center gap-2">
        <Select
          value={String(ratingFilter)}
          onValueChange={(v) => setRatingFilter(Number(v))}
        >
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="Rating" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0">Unrated+</SelectItem>
            <SelectItem value="1">1+ stars</SelectItem>
            <SelectItem value="2">2+ stars</SelectItem>
            <SelectItem value="3">3+ stars</SelectItem>
            <SelectItem value="4">4+ stars</SelectItem>
            <SelectItem value="5">5 stars</SelectItem>
          </SelectContent>
        </Select>

        <ToggleGroup
          type="single"
          value={statusFilter ?? 'unmarked'}
          onValueChange={(v) => {
            if (v) setStatusFilter(v as any)
          }}
        >
          <ToggleGroupItem value="all" size="sm">All</ToggleGroupItem>
          <ToggleGroupItem value="selected" size="sm">Selected</ToggleGroupItem>
          <ToggleGroupItem value="rejected" size="sm">Rejected</ToggleGroupItem>
          <ToggleGroupItem value="unmarked" size="sm">Unmarked</ToggleGroupItem>
        </ToggleGroup>
      </div>

      <Separator orientation="vertical" className="h-5" />

      <ToggleGroup type="single" value="image" className="gap-1">
        <ToggleGroupItem value="image" size="sm">Images</ToggleGroupItem>
      </ToggleGroup>

      <Separator orientation="vertical" className="h-5" />

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
        <SelectTrigger className="w-[160px]">
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

      <div className="min-w-0 flex-1" />

      <div className="flex min-w-[280px] items-center gap-2">
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search"
        />
        <span className={cn('shrink-0 text-xs text-muted-foreground')}>
          {(total || items.length).toLocaleString()} images
        </span>
      </div>
    </div>
  )
}
