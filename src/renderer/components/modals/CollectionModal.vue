<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { useCollectionStore } from '@/stores/collection'
import { useLibraryStore } from '@/stores/library'
import { useUIStore } from '@/stores/ui'

const DEFAULT_COLOR = 'var(--foreground)'

const COLORS = [
  DEFAULT_COLOR,
  '#06b6d4',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#f43f5e',
  '#8b5cf6',
  '#84cc16',
  '#f97316',
  '#64748b'
]

const uiStore = useUIStore()
const collectionStore = useCollectionStore()
const libraryStore = useLibraryStore()

const open = computed({
  get: () => uiStore.activeModals.includes('collection'),
  set: (val: boolean) => {
    if (!val) handleClose()
  }
})

const editingCollection = computed(() => {
  if (!collectionStore.editingCollectionId) return null
  return (
    collectionStore.collections.find((c) => c.id === collectionStore.editingCollectionId) ?? null
  )
})

const isEditing = computed(() => !!editingCollection.value)
const selectedCount = computed(() => libraryStore.selectedIds.size)
const showAddSelected = computed(() => !isEditing.value && selectedCount.value > 0)

const name = ref('')
const color = ref(DEFAULT_COLOR)
const addSelectedMedia = ref(true)
const saving = ref(false)
const error = ref<string | null>(null)

const canSave = computed(
  () => name.value.trim().length > 0 && name.value.trim().length <= 100 && !saving.value
)

// Reset form when modal opens/closes or editing target changes
watch(open, (isOpen) => {
  if (!isOpen) {
    name.value = ''
    color.value = DEFAULT_COLOR
    addSelectedMedia.value = true
    saving.value = false
    error.value = null
    return
  }

  if (editingCollection.value) {
    name.value = editingCollection.value.name
    color.value = editingCollection.value.color
  } else {
    name.value = ''
    color.value = DEFAULT_COLOR
    addSelectedMedia.value = true
  }

  saving.value = false
  error.value = null
})

function handleClose(): void {
  uiStore.closeModal('collection')
  collectionStore.setEditingCollectionId(null)
}

async function handleSave(): Promise<void> {
  const trimmed = name.value.trim()
  if (!trimmed || trimmed.length > 100) return

  saving.value = true
  error.value = null

  try {
    if (editingCollection.value) {
      await collectionStore.updateCollection(editingCollection.value.id, {
        name: trimmed,
        color: color.value
      })
    } else {
      await collectionStore.createCollection({
        name: trimmed,
        color: color.value,
        media_ids:
          showAddSelected.value && addSelectedMedia.value && selectedCount.value > 0
            ? [...libraryStore.selectedIds]
            : undefined
      })
    }
    handleClose()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    saving.value = false
  }
}

async function handleDelete(): Promise<void> {
  if (!editingCollection.value) return

  saving.value = true
  error.value = null

  try {
    await collectionStore.deleteCollection(editingCollection.value.id)
    handleClose()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="isEditing ? 'Edit Collection' : 'New Collection'"
    :description="
      isEditing ? 'Update collection details.' : 'Create a collection to organize selected media.'
    "
  >
    <template #body>
      <div class="space-y-4">
        <!-- Name -->
        <UFormField label="Name">
          <UInput
            v-model="name"
            placeholder="Collection name"
            :maxlength="100"
            autofocus
            @keydown.enter="handleSave"
          />
        </UFormField>

        <!-- Color swatches -->
        <UFormField label="Color">
          <div class="flex flex-wrap gap-2">
            <button
              v-for="swatch in COLORS"
              :key="swatch"
              type="button"
              class="size-6 rounded-full border transition-transform hover:scale-110"
              :class="
                swatch === color
                  ? 'ring-2 ring-primary ring-offset-2 ring-offset-default'
                  : 'border-default'
              "
              :style="{ backgroundColor: swatch }"
              :aria-label="`Select color ${swatch}`"
              @click="color = swatch"
            />
          </div>
        </UFormField>

        <!-- Optional: add selected media -->
        <UCheckbox
          v-if="showAddSelected"
          v-model="addSelectedMedia"
          :label="`Add ${selectedCount} selected items`"
        />

        <!-- Error -->
        <p v-if="error" class="text-sm text-error">{{ error }}</p>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full items-center gap-2">
        <UButton
          v-if="isEditing"
          icon="i-lucide-trash-2"
          label="Delete"
          color="error"
          variant="soft"
          :disabled="saving"
          class="mr-auto"
          @click="handleDelete"
        />
        <UButton
          label="Cancel"
          color="neutral"
          variant="outline"
          :disabled="saving"
          @click="handleClose"
        />
        <UButton
          :label="saving ? 'Saving…' : 'Save'"
          :disabled="!canSave"
          @click="handleSave"
        />
      </div>
    </template>
  </UModal>
</template>
