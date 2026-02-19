import * as React from 'react'
import { X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { useCollectionStore } from '@/stores/collection-store'
import { useLibraryStore } from '@/stores/library-store'

export function FilterBar(): React.JSX.Element {
  const ratingFilter = useLibraryStore((s) => s.ratingFilter)
  const statusFilter = useLibraryStore((s) => s.statusFilter)
  const searchQuery = useLibraryStore((s) => s.searchQuery)

  const setRatingFilter = useLibraryStore((s) => s.setRatingFilter)
  const setStatusFilter = useLibraryStore((s) => s.setStatusFilter)
  const setSearchQuery = useLibraryStore((s) => s.setSearchQuery)

  const collections = useCollectionStore((s) => s.collections)
  const activeCollectionId = useCollectionStore((s) => s.activeCollectionId)
  const setActiveCollection = useCollectionStore((s) => s.setActiveCollection)

  const activeCollection =
    activeCollectionId === 'special-all'
      ? null
      : (collections.find((collection) => collection.id === activeCollectionId) ?? null)

  const statusValue =
    statusFilter === 'all'
      ? 'all'
      : statusFilter === 'selected'
        ? 'selected'
        : statusFilter === 'rejected'
          ? 'rejected'
          : 'unmarked'

  return (
    <div className="flex items-center gap-3 px-2 py-2 bg-sidebar border-b">
      <div className="flex items-center gap-2">
        <Select value={String(ratingFilter)} onValueChange={(v) => setRatingFilter(Number(v))}>
          <SelectTrigger className="w-[120px] text-xs">
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

        <Select
          key={statusFilter}
          value={statusValue}
          onValueChange={(v) => {
            if (v === 'all') setStatusFilter('all')
            else if (v === 'selected') setStatusFilter('selected')
            else if (v === 'rejected') setStatusFilter('rejected')
            else setStatusFilter('unmarked')
          }}
        >
          <SelectTrigger className="w-[120px] text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="selected">Selected</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="unmarked">Unmarked</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1" />

      {activeCollection && (
        <div className="flex items-center gap-1 rounded-md border bg-card px-2 py-1 text-xs">
          <span
            className="size-2 rounded-full"
            style={{ backgroundColor: activeCollection.color }}
            aria-hidden="true"
          />
          <span className="max-w-[180px] truncate">{activeCollection.name}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="size-5"
            onClick={() => setActiveCollection('special-all')}
            aria-label="Clear collection filter"
          >
            <X className="size-3" />
          </Button>
        </div>
      )}

      <Input
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Search name or keywords…"
        className="w-[200px] text-xs"
      />
    </div>
  )
}
