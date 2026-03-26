<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import PaneLayout from '@/components/panes/PaneLayout.vue'
import PaneSection from '@/components/panes/PaneSection.vue'
import StarRating from '@/components/panes/media-info/StarRating.vue'
import KeywordEditor from '@/components/panes/media-info/KeywordEditor.vue'
import { useLibraryStore } from '@/stores/library'
import { formatDuration } from '@/lib/media'
import type { MediaUpdate } from '@/types'

const libraryStore = useLibraryStore()

// ---------------------------------------------------------------------------
// Derived state
// ---------------------------------------------------------------------------

const isMulti = computed(() => libraryStore.selectedIds.size > 1)

const media = computed(() => {
  if (!libraryStore.focusedId) return null
  return libraryStore.items.find((m) => m.id === libraryStore.focusedId) ?? null
})

const currentStatus = computed<'selected' | 'rejected' | 'unmarked'>(
  () => media.value?.status ?? 'unmarked'
)

const deleteCount = computed(() => (isMulti.value ? libraryStore.selectedIds.size : 1))

// ---------------------------------------------------------------------------
// File info rows
// ---------------------------------------------------------------------------

const fileInfoRows = computed(() => {
  const m = media.value
  if (!m) return []

  const rows = [
    { label: 'Name', value: m.file_name ?? '—' },
    { label: 'Date', value: m.created_at ? new Date(m.created_at).toLocaleString() : '—' },
    {
      label: 'Size',
      value: m.file_size ? `${(m.file_size / (1024 * 1024)).toFixed(2)} MB` : '—'
    },
    {
      label: 'Format',
      value: m.file_name ? (m.file_name.split('.').pop()?.toUpperCase() ?? '—') : '—'
    },
    {
      label: 'Dimensions',
      value: m.width && m.height ? `${m.width} × ${m.height}` : '—'
    }
  ]

  if (m.media_type === 'video') {
    rows.push({
      label: 'Duration',
      value: m.duration !== null ? formatDuration(m.duration) : '—'
    })
  } else {
    rows.push({
      label: 'Megapixels',
      value: m.width && m.height ? `${((m.width * m.height) / 1_000_000).toFixed(1)} MP` : '—'
    })
  }

  rows.push({ label: 'Origin', value: m.origin ?? '—' })
  return rows
})

// ---------------------------------------------------------------------------
// Keywords
// ---------------------------------------------------------------------------

const keywords = ref<string[]>([])

async function fetchKeywords(mediaId: string): Promise<void> {
  keywords.value = await window.api.keywords.getForMedia(mediaId)
}

watch(
  () => media.value?.id,
  async (id) => {
    if (id) {
      await fetchKeywords(id)
    } else {
      keywords.value = []
    }
  },
  { immediate: true }
)

async function handleAddKeyword(keyword: string): Promise<void> {
  if (isMulti.value) {
    // Bulk add to all selected items
    const ids = [...libraryStore.selectedIds]
    await Promise.all(ids.map((id) => window.api.keywords.addToMedia(id, keyword)))
  } else if (media.value) {
    await window.api.keywords.addToMedia(media.value.id, keyword)
  }
  if (media.value) await fetchKeywords(media.value.id)
  const page = await window.api.getMedia(libraryStore.buildQuery())
  libraryStore.setItems(page)
}

async function handleRemoveKeyword(keyword: string): Promise<void> {
  if (!media.value) return
  await window.api.keywords.removeFromMedia(media.value.id, keyword)
  await fetchKeywords(media.value.id)
  const page = await window.api.getMedia(libraryStore.buildQuery())
  libraryStore.setItems(page)
}

// ---------------------------------------------------------------------------
// Persist rating / status updates
// ---------------------------------------------------------------------------

async function persistUpdate(id: string, updates: MediaUpdate): Promise<void> {
  libraryStore.updateLocalItem(id, updates)
  try {
    await window.api.updateMedia(id, updates)
  } finally {
    const page = await window.api.getMedia(libraryStore.buildQuery())
    libraryStore.setItems(page)
  }
}

async function persistUpdateBulk(ids: string[], updates: MediaUpdate): Promise<void> {
  for (const id of ids) libraryStore.updateLocalItem(id, updates)
  try {
    await Promise.all(ids.map((id) => window.api.updateMedia(id, updates)))
  } finally {
    const page = await window.api.getMedia(libraryStore.buildQuery())
    libraryStore.setItems(page)
  }
}

function handleRatingChange(rating: number): void {
  if (isMulti.value) {
    void persistUpdateBulk([...libraryStore.selectedIds], { rating })
  } else if (media.value) {
    void persistUpdate(media.value.id, { rating })
  }
}

function handleStatusChange(status: 'selected' | 'rejected' | 'unmarked'): void {
  const updates: MediaUpdate = status === 'unmarked' ? { status: null } : { status }
  if (isMulti.value) {
    void persistUpdateBulk([...libraryStore.selectedIds], updates)
  } else if (media.value) {
    void persistUpdate(media.value.id, updates)
  }
}

// ---------------------------------------------------------------------------
// File actions
// ---------------------------------------------------------------------------

function handleShowInFolder(): void {
  if (media.value) window.api.showMediaInFolder(media.value.id)
}

function handleOpenInApp(): void {
  if (isMulti.value) {
    for (const id of libraryStore.selectedIds) window.api.openMediaInApp(id)
  } else if (media.value) {
    window.api.openMediaInApp(media.value.id)
  }
}

function handleCopyToClipboard(): void {
  if (media.value) window.api.copyMediaToClipboard(media.value.id)
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

const deleteDialogOpen = ref(false)

async function executeDelete(): Promise<void> {
  const idsToDelete = isMulti.value
    ? [...libraryStore.selectedIds]
    : media.value?.id
      ? [media.value.id]
      : []
  if (idsToDelete.length === 0) return

  const deleteSet = new Set(idsToDelete)
  const remaining = libraryStore.items.filter((m) => !deleteSet.has(m.id))
  const nextItem = remaining[0] ?? null

  await window.api.deleteMedia(idsToDelete)
  libraryStore.removeItems(idsToDelete)

  if (nextItem) {
    libraryStore.selectSingle(nextItem.id)
  } else {
    libraryStore.setSelection(new Set())
  }

  const page = await window.api.getMedia(libraryStore.buildQuery())
  libraryStore.setItems(page)
  deleteDialogOpen.value = false
}

async function handleDelete(): Promise<void> {
  const hasItems = isMulti.value ? libraryStore.selectedIds.size > 0 : !!media.value?.id
  if (!hasItems) return

  const settings = await window.api.getSettings()
  if (settings.confirm_before_delete) {
    deleteDialogOpen.value = true
  } else {
    void executeDelete()
  }
}

const hasSelection = computed(() => media.value !== null || isMulti.value)
</script>

<template>
  <PaneLayout title="Media Info">
    <div class="space-y-5">
      <!-- Multi-selection indicator -->
      <p v-if="isMulti" class="text-sm font-medium text-muted">
        {{ libraryStore.selectedIds.size }} items selected
      </p>

      <!-- Rating -->
      <PaneSection title="Rating">
        <StarRating :rating="media?.rating ?? 0" @change="handleRatingChange" />
      </PaneSection>

      <!-- Status -->
      <PaneSection title="Status">
        <div class="flex items-center gap-1">
          <UTooltip text="Selected">
            <UButton
              icon="i-lucide-circle-check"
              :color="currentStatus === 'selected' ? 'primary' : 'neutral'"
              :variant="currentStatus === 'selected' ? 'subtle' : 'ghost'"
              size="sm"
              aria-label="Selected"
              @click="handleStatusChange('selected')"
            />
          </UTooltip>
          <UTooltip text="Rejected">
            <UButton
              icon="i-lucide-circle-x"
              :color="currentStatus === 'rejected' ? 'error' : 'neutral'"
              :variant="currentStatus === 'rejected' ? 'subtle' : 'ghost'"
              size="sm"
              aria-label="Rejected"
              @click="handleStatusChange('rejected')"
            />
          </UTooltip>
          <UTooltip text="Clear">
            <UButton
              icon="i-lucide-circle-minus"
              color="neutral"
              variant="ghost"
              size="sm"
              aria-label="Clear status"
              @click="handleStatusChange('unmarked')"
            />
          </UTooltip>
        </div>
      </PaneSection>

      <!-- File Info (single selection only) -->
      <PaneSection v-if="!isMulti && media" title="File Info">
        <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <template v-for="row in fileInfoRows" :key="row.label">
            <dt class="text-muted">{{ row.label }}</dt>
            <dd class="truncate text-default">{{ row.value }}</dd>
          </template>
        </dl>
      </PaneSection>

      <!-- Actions -->
      <PaneSection v-if="hasSelection" title="Actions">
        <div class="flex flex-wrap gap-1">
          <UTooltip v-if="!isMulti" text="Show in folder">
            <UButton
              icon="i-lucide-folder-open"
              color="neutral"
              variant="outline"
              size="sm"
              @click="handleShowInFolder"
            />
          </UTooltip>
          <UTooltip text="Open in default app">
            <UButton
              icon="i-lucide-external-link"
              color="neutral"
              variant="outline"
              size="sm"
              @click="handleOpenInApp"
            />
          </UTooltip>
          <UTooltip v-if="!isMulti" text="Copy to clipboard">
            <UButton
              icon="i-lucide-clipboard-copy"
              color="neutral"
              variant="outline"
              size="sm"
              @click="handleCopyToClipboard"
            />
          </UTooltip>
          <UTooltip :text="isMulti ? `Delete ${deleteCount} items` : 'Delete item'">
            <UButton
              icon="i-lucide-trash-2"
              color="error"
              variant="outline"
              size="sm"
              @click="handleDelete"
            />
          </UTooltip>
        </div>
      </PaneSection>

      <!-- Keywords -->
      <PaneSection title="Keywords">
        <KeywordEditor
          v-if="media"
          :keywords="keywords"
          :hide-remove="isMulti"
          @add="handleAddKeyword"
          @remove="handleRemoveKeyword"
        />
        <p v-else class="text-xs text-muted">No selection</p>
      </PaneSection>
    </div>

    <!-- Delete confirmation modal -->
    <UModal
      v-model:open="deleteDialogOpen"
      :title="isMulti ? `Delete ${deleteCount} images?` : 'Delete image?'"
      :description="
        isMulti
          ? `This will permanently delete ${deleteCount} files from disk. This action cannot be undone.`
          : 'This will permanently delete the file from disk. This action cannot be undone.'
      "
    >
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton
            label="Cancel"
            color="neutral"
            variant="outline"
            @click="deleteDialogOpen = false"
          />
          <UButton label="Delete" color="error" @click="executeDelete" />
        </div>
      </template>
    </UModal>
  </PaneLayout>
</template>