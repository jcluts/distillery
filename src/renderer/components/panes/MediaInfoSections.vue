<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'

import PaneSection from '@/components/panes/primitives/PaneSection.vue'
import StarRating from '@/components/shared/StarRating.vue'
import KeywordEditor from '@/components/shared/KeywordEditor.vue'
import { useCollectionStore } from '@/stores/collection'
import { useLibraryStore } from '@/stores/library'
import { formatDuration } from '@/lib/media'
import type { CollectionRecord, MediaUpdate } from '@/types'

const libraryStore = useLibraryStore()
const collectionStore = useCollectionStore()

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
    { label: 'Name', value: m.file_name ?? '-' },
    { label: 'Date', value: m.created_at ? new Date(m.created_at).toLocaleString() : '-' },
    {
      label: 'Size',
      value: m.file_size ? `${(m.file_size / (1024 * 1024)).toFixed(2)} MB` : '-'
    },
    {
      label: 'Format',
      value: m.file_name ? (m.file_name.split('.').pop()?.toUpperCase() ?? '-') : '-'
    },
    {
      label: 'Dimensions',
      value: m.width && m.height ? `${m.width} x ${m.height}` : '-'
    }
  ]

  if (m.media_type === 'video') {
    rows.push({
      label: 'Duration',
      value: m.duration !== null ? formatDuration(m.duration) : '-'
    })
  } else {
    rows.push({
      label: 'Megapixels',
      value: m.width && m.height ? `${((m.width * m.height) / 1_000_000).toFixed(1)} MP` : '-'
    })
  }

  rows.push({ label: 'Origin', value: m.origin ?? '-' })
  return rows
})

// ---------------------------------------------------------------------------
// Keywords
// ---------------------------------------------------------------------------

const keywords = ref<string[]>([])
const mediaCollections = ref<CollectionRecord[]>([])

async function fetchKeywords(mediaId: string): Promise<void> {
  keywords.value = await window.api.keywords.getForMedia(mediaId)
}

watch(
  [
    () => media.value?.id,
    () =>
      collectionStore.collections
        .map((collection) => `${collection.id}:${collection.media_count}:${collection.updated_at}`)
        .join('|')
  ],
  async (id) => {
    const mediaId = id[0]
    if (mediaId) {
      const [nextKeywords, nextCollections] = await Promise.all([
        window.api.keywords.getForMedia(mediaId),
        window.api.collections.getForMedia(mediaId)
      ])
      if (media.value?.id !== mediaId) return
      keywords.value = nextKeywords
      mediaCollections.value = nextCollections
    } else {
      keywords.value = []
      mediaCollections.value = []
    }
  },
  { immediate: true }
)

async function handleAddKeyword(keyword: string): Promise<void> {
  if (isMulti.value) {
    const ids = [...libraryStore.selectedIds]
    await Promise.all(ids.map((id) => window.api.keywords.addToMedia(id, keyword)))
  } else if (media.value) {
    await window.api.keywords.addToMedia(media.value.id, keyword)
  }
  if (media.value) await fetchKeywords(media.value.id)
  await libraryStore.loadMedia()
}

async function handleRemoveKeyword(keyword: string): Promise<void> {
  if (!media.value) return
  await window.api.keywords.removeFromMedia(media.value.id, keyword)
  await fetchKeywords(media.value.id)
  await libraryStore.loadMedia()
}

// ---------------------------------------------------------------------------
// Persist rating / status updates
// ---------------------------------------------------------------------------

async function persistUpdate(id: string, updates: MediaUpdate): Promise<void> {
  libraryStore.updateLocalItem(id, updates)
  try {
    await window.api.updateMedia(id, updates)
  } catch (error) {
    await libraryStore.loadMedia()
    throw error
  }
}

async function persistUpdateBulk(ids: string[], updates: MediaUpdate): Promise<void> {
  for (const id of ids) libraryStore.updateLocalItem(id, updates)
  try {
    await Promise.all(ids.map((id) => window.api.updateMedia(id, updates)))
  } catch (error) {
    await libraryStore.loadMedia()
    throw error
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

  await libraryStore.loadMedia()
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
  <p v-if="isMulti" class="text-sm font-medium text-muted">
    {{ libraryStore.selectedIds.size }} items selected
  </p>

  <PaneSection title="Rating">
    <StarRating :rating="media?.rating ?? 0" @change="handleRatingChange" />
  </PaneSection>

  <PaneSection title="Status">
    <div class="flex items-center gap-1">
      <Button
        v-tooltip="'Selected'"
        text
        :plain="currentStatus !== 'selected'"
        :severity="currentStatus === 'selected' ? undefined : 'secondary'"
        size="small"
        aria-label="Selected"
        @click="handleStatusChange('selected')"
      >
        <Icon icon="lucide:circle-check" class="size-4" />
      </Button>
      <Button
        v-tooltip="'Rejected'"
        text
        :plain="currentStatus !== 'rejected'"
        :severity="currentStatus === 'rejected' ? 'danger' : 'secondary'"
        size="small"
        aria-label="Rejected"
        @click="handleStatusChange('rejected')"
      >
        <Icon icon="lucide:circle-x" class="size-4" />
      </Button>
      <Button
        v-tooltip="'Clear'"
        text
        :plain="currentStatus !== 'unmarked'"
        severity="secondary"
        size="small"
        aria-label="Clear status"
        @click="handleStatusChange('unmarked')"
      >
        <Icon icon="lucide:circle-minus" class="size-4" />
      </Button>
    </div>
  </PaneSection>

  <PaneSection v-if="!isMulti && media" title="File Info">
    <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
      <template v-for="row in fileInfoRows" :key="row.label">
        <dt class="text-muted">{{ row.label }}</dt>
        <dd class="truncate text-default">{{ row.value }}</dd>
      </template>
    </dl>
  </PaneSection>

  <PaneSection v-if="!isMulti" title="Collections">
    <div v-if="media">
      <div v-if="mediaCollections.length > 0" class="space-y-1">
        <div
          v-for="collection in mediaCollections"
          :key="collection.id"
          class="flex min-w-0 items-center gap-2 text-xs text-default"
        >
          <span
            class="size-2 shrink-0 rounded-full"
            :style="{ backgroundColor: collection.color }"
            aria-hidden="true"
          />
          <span class="truncate">{{ collection.name }}</span>
        </div>
      </div>
      <p v-else class="text-xs text-muted">No collections</p>
    </div>
    <p v-else class="text-xs text-muted">No selection</p>
  </PaneSection>

  <PaneSection v-if="hasSelection" title="Actions">
    <div class="flex flex-wrap gap-1">
      <Button
        v-if="!isMulti"
        v-tooltip="'Show in folder'"
        outlined
        severity="secondary"
        size="small"
        @click="handleShowInFolder"
      >
        <Icon icon="lucide:folder-open" class="size-4" />
      </Button>
      <Button
        v-tooltip="'Open in default app'"
        outlined
        severity="secondary"
        size="small"
        @click="handleOpenInApp"
      >
        <Icon icon="lucide:external-link" class="size-4" />
      </Button>
      <Button
        v-if="!isMulti"
        v-tooltip="'Copy to clipboard'"
        outlined
        severity="secondary"
        size="small"
        @click="handleCopyToClipboard"
      >
        <Icon icon="lucide:clipboard-copy" class="size-4" />
      </Button>
      <Button
        v-tooltip="isMulti ? `Delete ${deleteCount} items` : 'Delete item'"
        outlined
        severity="danger"
        size="small"
        @click="handleDelete"
      >
        <Icon icon="lucide:trash-2" class="size-4" />
      </Button>
    </div>
  </PaneSection>

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

  <Dialog
    v-model:visible="deleteDialogOpen"
    :header="isMulti ? `Delete ${deleteCount} images?` : 'Delete image?'"
    modal
    :closable="true"
    :style="{ width: '24rem' }"
  >
    <p class="text-sm">
      {{
        isMulti
          ? `This will permanently delete ${deleteCount} files from disk. This action cannot be undone.`
          : 'This will permanently delete the file from disk. This action cannot be undone.'
      }}
    </p>
    <template #footer>
      <div class="flex justify-end gap-2">
        <Button label="Cancel" outlined severity="secondary" @click="deleteDialogOpen = false" />
        <Button label="Delete" severity="danger" @click="executeDelete" />
      </div>
    </template>
  </Dialog>
</template>
