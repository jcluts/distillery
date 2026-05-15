import { defineStore, storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'

import { GRID_PAGE_SIZE } from '@/lib/constants'
import { useCollectionStore } from '@/stores/collection'
import type {
  MediaPage,
  MediaQuery,
  MediaRecord,
  MediaSortField,
  MediaStatus,
  MediaType
} from '@/types'

function normalizeSelection(items: MediaRecord[], selectedIds: Set<string>): Set<string> {
  if (selectedIds.size === 0) return selectedIds

  const validIds = new Set(items.map((item) => item.id))
  return new Set([...selectedIds].filter((id) => validIds.has(id)))
}

export const useLibraryStore = defineStore('library', () => {
  const items = ref<MediaRecord[]>([])
  const total = ref(0)
  const page = ref(1)
  const pageSize = ref(GRID_PAGE_SIZE)
  const isLoading = ref(false)
  const isLoadingMore = ref(false)

  const selectedIds = ref(new Set<string>())
  const focusedId = ref<string | null>(null)

  const ratingFilter = ref(0)
  const statusFilter = ref<MediaStatus | 'unmarked' | 'all'>('all')
  const mediaTypeFilter = ref<MediaType | 'all'>('all')
  const searchQuery = ref('')
  const sortField = ref<MediaSortField>('created_at')
  const sortDirection = ref<'asc' | 'desc'>('desc')

  const collectionStore = useCollectionStore()
  const { activeCollectionId } = storeToRefs(collectionStore)

  const hasMore = computed(() => items.value.length < total.value)
  let queryRevision = 0

  function buildQuery(): MediaQuery {
    return {
      page: page.value,
      pageSize: pageSize.value,
      rating: ratingFilter.value > 0 ? ratingFilter.value : undefined,
      status: statusFilter.value !== 'all' ? statusFilter.value : undefined,
      media_type: mediaTypeFilter.value !== 'all' ? mediaTypeFilter.value : undefined,
      sort: sortField.value,
      sortDirection: sortDirection.value,
      search: searchQuery.value || undefined,
      collectionId: activeCollectionId.value
    }
  }

  watch(activeCollectionId, () => {
    page.value = 1
    void loadMedia()
  })

  function applyMediaPage(mediaPage: MediaPage, append = false): void {
    if (append) {
      const seen = new Set(items.value.map((item) => item.id))
      items.value = [...items.value, ...mediaPage.items.filter((item) => !seen.has(item.id))]
    } else {
      items.value = mediaPage.items
    }

    total.value = mediaPage.total
    page.value = mediaPage.page
    pageSize.value = mediaPage.pageSize

    selectedIds.value = normalizeSelection(items.value, selectedIds.value)
    if (focusedId.value && !items.value.some((item) => item.id === focusedId.value)) {
      focusedId.value = selectedIds.value.values().next().value ?? null
    }
  }

  function prepareForGeneratedMedia(mediaType: MediaType | null): void {
    page.value = 1

    if (mediaType && mediaTypeFilter.value !== 'all' && mediaTypeFilter.value !== mediaType) {
      mediaTypeFilter.value = 'all'
    }
  }

  async function loadMedia(): Promise<void> {
    page.value = 1
    const revision = ++queryRevision
    isLoading.value = true
    try {
      const mediaPage = await window.api.getMedia(buildQuery())
      if (revision !== queryRevision) return
      applyMediaPage(mediaPage)
    } finally {
      if (revision === queryRevision) {
        isLoading.value = false
      }
    }
  }

  async function loadNextPage(): Promise<void> {
    if (isLoading.value || isLoadingMore.value || !hasMore.value) return

    const revision = queryRevision
    isLoadingMore.value = true
    try {
      const mediaPage = await window.api.getMedia({
        ...buildQuery(),
        page: page.value + 1
      })
      if (revision !== queryRevision) return
      applyMediaPage(mediaPage, true)
    } finally {
      isLoadingMore.value = false
    }
  }

  async function ensureIndexLoaded(index: number): Promise<void> {
    if (index < items.value.length || index < 0) return

    while (index >= items.value.length && hasMore.value) {
      const previousLength = items.value.length
      await loadNextPage()
      if (items.value.length === previousLength) break
    }
  }

  function selectSingle(id: string): void {
    selectedIds.value = new Set([id])
    focusedId.value = id
  }

  function toggleSelect(id: string): void {
    const next = new Set(selectedIds.value)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    selectedIds.value = next
    focusedId.value = id
  }

  function rangeSelect(id: string): void {
    if (!focusedId.value) {
      selectSingle(id)
      return
    }

    const startIndex = items.value.findIndex((item) => item.id === focusedId.value)
    const endIndex = items.value.findIndex((item) => item.id === id)

    if (startIndex < 0 || endIndex < 0) {
      selectSingle(id)
      return
    }

    const [start, end] = startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex]
    const rangeIds = items.value.slice(start, end + 1).map((item) => item.id)
    selectedIds.value = new Set([...selectedIds.value, ...rangeIds])
    focusedId.value = id
  }

  async function focusRelative(offset: number): Promise<void> {
    if (items.value.length === 0) return

    const currentIndex = focusedId.value
      ? items.value.findIndex((item) => item.id === focusedId.value)
      : -1
    const baseIndex = currentIndex >= 0 ? currentIndex : 0
    const targetIndex = baseIndex + offset
    if (targetIndex >= items.value.length) {
      await ensureIndexLoaded(targetIndex)
    }

    const nextIndex = Math.min(items.value.length - 1, Math.max(0, targetIndex))
    const nextItem = items.value[nextIndex]
    if (nextItem) {
      selectSingle(nextItem.id)
    }
  }

  function updateLocalItem(id: string, updates: Partial<MediaRecord>): void {
    items.value = items.value.map((item) => (item.id === id ? { ...item, ...updates } : item))
  }

  function removeItems(ids: string[]): void {
    const deleteSet = new Set(ids)
    items.value = items.value.filter((item) => !deleteSet.has(item.id))
    total.value = Math.max(0, total.value - ids.length)
    selectedIds.value = normalizeSelection(items.value, selectedIds.value)
    if (focusedId.value && deleteSet.has(focusedId.value)) {
      focusedId.value = selectedIds.value.values().next().value ?? null
    }
  }

  function selectAll(): void {
    selectedIds.value = new Set(items.value.map((m) => m.id))
  }

  function setSelection(ids: Set<string>): void {
    selectedIds.value = ids
    if (ids.size === 0) {
      focusedId.value = null
    } else if (focusedId.value && !ids.has(focusedId.value)) {
      focusedId.value = ids.values().next().value ?? null
    }
  }

  return {
    items,
    total,
    page,
    pageSize,
    isLoading,
    isLoadingMore,
    hasMore,
    selectedIds,
    focusedId,
    ratingFilter,
    statusFilter,
    mediaTypeFilter,
    searchQuery,
    sortField,
    sortDirection,
    buildQuery,
    prepareForGeneratedMedia,
    loadMedia,
    loadNextPage,
    ensureIndexLoaded,
    selectSingle,
    toggleSelect,
    rangeSelect,
    focusRelative,
    updateLocalItem,
    removeItems,
    selectAll,
    setSelection
  }
})
