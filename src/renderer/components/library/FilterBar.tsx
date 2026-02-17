import * as React from 'react'

import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useLibraryStore } from '@/stores/library-store'

export function FilterBar(): React.JSX.Element {
  const ratingFilter = useLibraryStore((s) => s.ratingFilter)
  const statusFilter = useLibraryStore((s) => s.statusFilter)
  const searchQuery = useLibraryStore((s) => s.searchQuery)

  const setRatingFilter = useLibraryStore((s) => s.setRatingFilter)
  const setStatusFilter = useLibraryStore((s) => s.setStatusFilter)
  const setSearchQuery = useLibraryStore((s) => s.setSearchQuery)

  const statusValue =
    statusFilter === 'all'
      ? 'all'
      : statusFilter === 'selected'
        ? 'selected'
        : statusFilter === 'rejected'
          ? 'rejected'
          : 'unmarked'

  return (
    <div className="flex items-center gap-3 border-b bg-background px-3 h-12">
      <div className="flex items-center gap-2">
        <Select
          value={String(ratingFilter)}
          onValueChange={(v) => setRatingFilter(Number(v))}
        >
          <SelectTrigger className="h-7 w-[120px] text-xs">
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
          value={statusValue}
          onValueChange={(v) => {
            if (v === 'all') setStatusFilter('all')
            else if (v === 'selected') setStatusFilter('selected')
            else if (v === 'rejected') setStatusFilter('rejected')
            else setStatusFilter('unmarked')
          }}
        >
          <SelectTrigger className="h-7 w-[120px] text-xs">
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

      <Input
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Search name or keywords…"
        className="h-7 w-[200px] text-xs"
      />
    </div>
  )
}
