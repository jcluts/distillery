<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import Button from 'primevue/button'
import Divider from 'primevue/divider'
import InputText from 'primevue/inputtext'
import Tag from 'primevue/tag'
import ToggleSwitch from 'primevue/toggleswitch'

import PaneLayout from '@/components/panes/primitives/PaneLayout.vue'
import ListItem from '@/components/shared/ListItem.vue'
import { useCollectionStore } from '@/stores/collection'
import { useLibraryStore } from '@/stores/library'
import { useUIStore } from '@/stores/ui'
import type { CollectionRecord } from '@/types'

const DEFAULT_COLOR = 'var(--foreground)'
const NEW_COLLECTION_INPUT_ID = 'new-collection-name'

const uiStore = useUIStore()
const collectionStore = useCollectionStore()
const libraryStore = useLibraryStore()

const isCreating = ref(false)
const newCollectionName = ref('')
const includeSelectedMedia = ref(true)
const createError = ref<string | null>(null)
const isSavingCollection = ref(false)
const selectedCount = computed(() => libraryStore.selectedIds.size)
const canCreateCollection = computed(
  () => newCollectionName.value.trim().length > 0 && !isSavingCollection.value
)
const includeSelectedLabel = computed(() =>
  selectedCount.value === 0
    ? 'No selected media'
    : selectedCount.value === 1
      ? 'Include 1 selected item'
      : `Include ${selectedCount.value} selected items`
)

watch(selectedCount, (count) => {
  if (count === 0) {
    includeSelectedMedia.value = false
  }
})

async function startCreate(): Promise<void> {
  isCreating.value = true
  includeSelectedMedia.value = selectedCount.value > 0
  createError.value = null
  await nextTick()
  document.getElementById(NEW_COLLECTION_INPUT_ID)?.focus()
}

function cancelCreate(): void {
  isCreating.value = false
  newCollectionName.value = ''
  includeSelectedMedia.value = true
  createError.value = null
  isSavingCollection.value = false
}

async function createCollection(): Promise<void> {
  const name = newCollectionName.value.trim()
  if (!name || isSavingCollection.value) return

  isSavingCollection.value = true
  createError.value = null

  try {
    await collectionStore.createCollection({
      name,
      color: DEFAULT_COLOR,
      media_ids:
        includeSelectedMedia.value && selectedCount.value > 0
          ? [...libraryStore.selectedIds]
          : undefined
    })
    cancelCreate()
  } catch (error) {
    createError.value = error instanceof Error ? error.message : String(error)
  } finally {
    isSavingCollection.value = false
  }
}

// ---------------------------------------------------------------------------
// Drag & drop state
// ---------------------------------------------------------------------------

const draggingCollectionId = ref<string | null>(null)
const dragOverCollectionId = ref<string | null>(null)
const mediaDragOverId = ref<string | null>(null)

function hasMediaDragData(e: DragEvent): boolean {
  return (
    e.dataTransfer?.types.includes('application/x-distillery-media-ids') === true ||
    e.dataTransfer?.types.includes('application/x-distillery-media-id') === true
  )
}

function parseDroppedMediaIds(e: DragEvent): string[] {
  if (!e.dataTransfer) return []

  const multiIdsRaw = e.dataTransfer.getData('application/x-distillery-media-ids')
  const singleId = e.dataTransfer.getData('application/x-distillery-media-id')

  if (multiIdsRaw) {
    try {
      const parsed: unknown = JSON.parse(multiIdsRaw)
      if (Array.isArray(parsed)) {
        return parsed.filter((id): id is string => typeof id === 'string' && id.length > 0)
      }
    } catch {
      // no-op
    }
  }

  return singleId ? [singleId] : []
}

// ---------------------------------------------------------------------------
// Collection drag-to-reorder handlers
// ---------------------------------------------------------------------------

function onDragStart(e: DragEvent, collection: CollectionRecord): void {
  draggingCollectionId.value = collection.id
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('application/x-distillery-collection-id', collection.id)
  }
}

function onDragEnd(): void {
  draggingCollectionId.value = null
  dragOverCollectionId.value = null
}

function onDragOver(e: DragEvent, collection: CollectionRecord): void {
  if (hasMediaDragData(e)) {
    e.preventDefault()
    mediaDragOverId.value = collection.id
    return
  }

  if (draggingCollectionId.value && draggingCollectionId.value !== collection.id) {
    e.preventDefault()
    dragOverCollectionId.value = collection.id
  }
}

function onDragLeave(): void {
  dragOverCollectionId.value = null
  mediaDragOverId.value = null
}

function onDrop(e: DragEvent, collection: CollectionRecord): void {
  e.preventDefault()
  mediaDragOverId.value = null

  // Handle media drop onto collection
  const mediaIds = parseDroppedMediaIds(e)
  if (mediaIds.length > 0) {
    void collectionStore.addMediaToCollection(collection.id, mediaIds)
    dragOverCollectionId.value = null
    return
  }

  // Handle collection reorder
  const draggedId =
    e.dataTransfer?.getData('application/x-distillery-collection-id') || draggingCollectionId.value

  if (!draggedId || draggedId === collection.id) {
    dragOverCollectionId.value = null
    return
  }

  const orderedIds = collectionStore.manualCollections.map((c) => c.id)
  const fromIndex = orderedIds.indexOf(draggedId)
  const toIndex = orderedIds.indexOf(collection.id)

  if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
    dragOverCollectionId.value = null
    return
  }

  const [moved] = orderedIds.splice(fromIndex, 1)
  orderedIds.splice(toIndex, 0, moved)
  collectionStore.reorderCollections(orderedIds)

  draggingCollectionId.value = null
  dragOverCollectionId.value = null
}

// ---------------------------------------------------------------------------
// Edit modal (placeholder — modal not yet ported)
// ---------------------------------------------------------------------------

function openEditModal(collectionId: string): void {
  collectionStore.setEditingCollectionId(collectionId)
  uiStore.openModal('collection')
}
</script>

<template>
  <PaneLayout title="Collections">
    <template #actions>
      <Button
        v-if="!isCreating"
        v-tooltip.left="'New collection'"
        text
        plain
        severity="secondary"
        size="small"
        @click="startCreate"
      >
        <Icon icon="lucide:plus" class="size-4" />
      </Button>
    </template>

    <div class="space-y-3">
      <form
        v-if="isCreating"
        class="space-y-3 rounded-md border border-default bg-elevated p-3"
        @submit.prevent="createCollection"
      >
        <div class="flex items-center gap-2">
          <InputText
            :id="NEW_COLLECTION_INPUT_ID"
            v-model="newCollectionName"
            placeholder="Collection name"
            :maxlength="100"
            class="min-w-0 flex-1"
            size="small"
          />
          <Button
            v-tooltip.top="'Create collection'"
            type="submit"
            size="small"
            :loading="isSavingCollection"
            :disabled="!canCreateCollection"
          >
            <Icon icon="lucide:check" class="size-4" />
          </Button>
          <Button
            v-tooltip.top="'Cancel'"
            type="button"
            text
            plain
            severity="secondary"
            size="small"
            :disabled="isSavingCollection"
            @click="cancelCreate"
          >
            <Icon icon="lucide:x" class="size-4" />
          </Button>
        </div>

        <div class="flex items-center justify-between gap-3">
          <label for="include-selected-media" class="text-sm text-muted">
            {{ includeSelectedLabel }}
          </label>
          <ToggleSwitch
            id="include-selected-media"
            v-model="includeSelectedMedia"
            :disabled="selectedCount === 0 || isSavingCollection"
          />
        </div>

        <p v-if="createError" class="text-sm text-error">{{ createError }}</p>
      </form>

      <div class="space-y-1">
        <!-- Special collections (All, Generated, Imported) -->
        <ListItem
          v-for="collection in collectionStore.specialCollections"
          :key="collection.id"
          selectable
          :selected="collection.id === collectionStore.activeCollectionId"
          @select="collectionStore.setActiveCollection(collection.id)"
        >
          <template #icon>
            <Icon icon="lucide:star" class="size-4 text-muted" />
          </template>
          <span class="truncate">{{ collection.name }}</span>
          <template #badge>
            <Tag severity="secondary">{{ collection.media_count }}</Tag>
          </template>
        </ListItem>

        <!-- Separator between special and manual collections -->
        <Divider
          v-if="
            collectionStore.specialCollections.length > 0 &&
            collectionStore.manualCollections.length > 0
          "
        />

        <!-- Manual collections (user-created, draggable) -->
        <ListItem
          v-for="collection in collectionStore.manualCollections"
          :key="collection.id"
          selectable
          :selected="collection.id === collectionStore.activeCollectionId"
          :draggable="true"
          :drag-over="dragOverCollectionId === collection.id || mediaDragOverId === collection.id"
          @select="collectionStore.setActiveCollection(collection.id)"
          @dragstart="onDragStart($event, collection)"
          @dragend="onDragEnd"
          @dragover="onDragOver($event, collection)"
          @dragleave="onDragLeave"
          @drop="onDrop($event, collection)"
        >
          <template #icon>
            <Icon icon="lucide:layers-3" class="size-4" :style="{ color: collection.color }" />
          </template>
          <span class="truncate">{{ collection.name }}</span>
          <template #actions>
            <Button
              v-tooltip="'Edit collection'"
              text
              plain
              severity="secondary"
              size="small"
              @click.stop="openEditModal(collection.id)"
            >
              <Icon icon="lucide:settings" class="size-4" />
            </Button>
          </template>
          <template #badge>
            <Tag severity="secondary">{{ collection.media_count }}</Tag>
          </template>
        </ListItem>
      </div>
    </div>
  </PaneLayout>
</template>
