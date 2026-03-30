<script setup lang="ts">
import { ref } from 'vue'
import { Icon } from '@iconify/vue'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import Divider from 'primevue/divider'

import PaneLayout from '@/components/panes/PaneLayout.vue'
import SelectableItem from '@/components/shared/SelectableItem.vue'
import { useCollectionStore } from '@/stores/collection'
import { useUIStore } from '@/stores/ui'
import type { CollectionRecord } from '@/types'

const uiStore = useUIStore()
const collectionStore = useCollectionStore()

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
    e.dataTransfer?.getData('application/x-distillery-collection-id') ||
    draggingCollectionId.value

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
    <div class="space-y-1">
      <!-- Special collections (All, Generated, Imported) -->
      <SelectableItem
        v-for="collection in collectionStore.specialCollections"
        :key="collection.id"
        :selected="collection.id === collectionStore.activeCollectionId"
        @select="collectionStore.setActiveCollection(collection.id)"
      >
        <Icon icon="lucide:star" class="size-4 shrink-0 text-muted" />
        <span class="min-w-0 flex-1 truncate">{{ collection.name }}</span>
        <Tag severity="secondary">
          {{ collection.media_count }}
        </Tag>
      </SelectableItem>

      <!-- Separator between special and manual collections -->
      <Divider
        v-if="collectionStore.specialCollections.length > 0 && collectionStore.manualCollections.length > 0"
      />

      <!-- Manual collections (user-created, draggable) -->
      <SelectableItem
        v-for="collection in collectionStore.manualCollections"
        :key="collection.id"
        :selected="collection.id === collectionStore.activeCollectionId"
        :draggable="true"
        :drag-over="
          dragOverCollectionId === collection.id || mediaDragOverId === collection.id
        "
        @select="collectionStore.setActiveCollection(collection.id)"
        @dragstart="onDragStart($event, collection)"
        @dragend="onDragEnd"
        @dragover="onDragOver($event, collection)"
        @dragleave="onDragLeave"
        @drop="onDrop($event, collection)"
      >
        <Icon
          icon="lucide:layers-3"
          class="size-4 shrink-0"
          :style="{ color: collection.color }"
        />
        <span class="min-w-0 flex-1 truncate">{{ collection.name }}</span>

        <Button
          v-tooltip="'Edit collection'"
          text
          plain
          severity="secondary"
          size="small"
          class="opacity-0 group-hover/item:opacity-100"
          @click.stop="openEditModal(collection.id)"
        >
          <Icon icon="lucide:settings" class="size-4" />
        </Button>

        <Tag severity="secondary">
          {{ collection.media_count }}
        </Tag>
      </SelectableItem>
    </div>
  </PaneLayout>
</template>
