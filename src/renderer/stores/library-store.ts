import { create } from 'zustand'
import type {
  MediaRecord,
  MediaQuery,
  MediaPage,
  MediaStatus,
  MediaSortField
} from '../types'

// =============================================================================
// Library Store
// Filter/sort state, selected media, media list.
// =============================================================================

interface LibraryState {
  // Media list
  items: MediaRecord[]
  total: number
  page: number
  pageSize: number
  isLoading: boolean

  // Selection
  selectedIds: Set<string>
  focusedId: string | null

  // Filters
  ratingFilter: number // minimum rating (0 = show all)
  statusFilter: MediaStatus | 'unmarked' | 'all'
  searchQuery: string
  sortField: MediaSortField
  sortDirection: 'asc' | 'desc'

  // Actions
  setItems: (page: MediaPage) => void
  prependItem: (item: MediaRecord) => void
  updateItem: (id: string, updates: Partial<MediaRecord>) => void
  removeItems: (ids: string[]) => void
  setSelection: (ids: Set<string>) => void
  selectSingle: (id: string) => void
  toggleSelect: (id: string) => void
  rangeSelect: (id: string) => void
  selectAll: () => void
  setFocusedId: (id: string | null) => void
  setRatingFilter: (rating: number) => void
  setStatusFilter: (status: MediaStatus | 'unmarked' | 'all') => void
  setSearchQuery: (query: string) => void
  setSortField: (field: MediaSortField) => void
  setSortDirection: (dir: 'asc' | 'desc') => void
  setLoading: (loading: boolean) => void

  // Computed
  buildQuery: () => MediaQuery
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  // Initial state
  items: [],
  total: 0,
  page: 1,
  pageSize: 200,
  isLoading: false,
  selectedIds: new Set(),
  focusedId: null,
  ratingFilter: 0,
  statusFilter: 'all',
  searchQuery: '',
  sortField: 'created_at',
  sortDirection: 'desc',

  // Actions
  setItems: (page) =>
    set({
      items: page.items,
      total: page.total,
      page: page.page,
      pageSize: page.pageSize
    }),

  prependItem: (item) =>
    set((state) => ({
      items: [item, ...state.items],
      total: state.total + 1
    })),

  updateItem: (id, updates) =>
    set((state) => ({
      items: state.items.map((item) =>
        item.id === id ? { ...item, ...updates } : item
      )
    })),

  removeItems: (ids) => {
    const idSet = new Set(ids)
    set((state) => ({
      items: state.items.filter((item) => !idSet.has(item.id)),
      total: state.total - ids.length,
      selectedIds: new Set(
        [...state.selectedIds].filter((id) => !idSet.has(id))
      )
    }))
  },

  setSelection: (ids) => set({ selectedIds: ids }),
  selectSingle: (id) => set({ selectedIds: new Set([id]), focusedId: id }),

  toggleSelect: (id) =>
    set((state) => {
      const next = new Set(state.selectedIds)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return { selectedIds: next, focusedId: id }
    }),

  rangeSelect: (id) =>
    set((state) => {
      const { items, focusedId } = state
      const anchorIndex = focusedId
        ? items.findIndex((m) => m.id === focusedId)
        : 0
      const targetIndex = items.findIndex((m) => m.id === id)
      if (anchorIndex === -1 || targetIndex === -1) {
        return { selectedIds: new Set([id]), focusedId: id }
      }
      const start = Math.min(anchorIndex, targetIndex)
      const end = Math.max(anchorIndex, targetIndex)
      const next = new Set<string>()
      for (let i = start; i <= end; i++) {
        next.add(items[i].id)
      }
      return { selectedIds: next, focusedId: id }
    }),

  selectAll: () =>
    set((state) => ({
      selectedIds: new Set(state.items.map((m) => m.id))
    })),

  setFocusedId: (id) => set({ focusedId: id }),
  setRatingFilter: (rating) => set({ ratingFilter: rating, page: 1 }),
  setStatusFilter: (status) => set({ statusFilter: status, page: 1 }),
  setSearchQuery: (query) => set({ searchQuery: query, page: 1 }),
  setSortField: (field) => set({ sortField: field, page: 1 }),
  setSortDirection: (dir) => set({ sortDirection: dir, page: 1 }),
  setLoading: (loading) => set({ isLoading: loading }),

  buildQuery: (): MediaQuery => {
    const state = get()
    return {
      page: state.page,
      pageSize: state.pageSize,
      rating: state.ratingFilter > 0 ? state.ratingFilter : undefined,
      status: state.statusFilter !== 'all' ? state.statusFilter : undefined,
      sort: state.sortField,
      sortDirection: state.sortDirection,
      search: state.searchQuery || undefined
    }
  }
}))
