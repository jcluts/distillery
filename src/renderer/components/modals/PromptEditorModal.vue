<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import ProgressSpinner from 'primevue/progressspinner'
import Select from 'primevue/select'
import Tag from 'primevue/tag'
import Textarea from 'primevue/textarea'
import { useToast } from 'primevue/usetoast'

import ListItem from '@/components/shared/ListItem.vue'
import StarRating from '@/components/shared/StarRating.vue'
import { useGenerationStore } from '@/stores/generation'
import { usePromptStore } from '@/stores/prompt'
import { useUIStore } from '@/stores/ui'
import type { PromptCollectionRecord, PromptRecord } from '@/types'

interface CollectionOption {
  label: string
  value: string | null
}

const uiStore = useUIStore()
const generationStore = useGenerationStore()
const promptStore = usePromptStore()
const toast = useToast()

const editorText = ref('')
const initialText = ref('')
const searchQuery = ref('')
const collectionFilterId = ref<string | null>(null)
const selectedPromptId = ref<string | null>(null)

const showSavePromptForm = ref(false)
const savePromptTitle = ref('')
const savePromptPending = ref(false)

const collectionFormMode = ref<'create' | 'edit' | null>(null)
const collectionFormName = ref('')
const collectionFormParentId = ref<string | null>(null)
const collectionFormPending = ref(false)
const collectionFormError = ref<string | null>(null)

const open = computed({
  get: () => uiStore.activeModals.includes('prompt-editor'),
  set: (visible: boolean) => {
    if (!visible) {
      handleRequestClose()
    }
  }
})

const isDirty = computed(() => editorText.value !== initialText.value)
const selectedPrompt = computed(
  () => promptStore.prompts.find((prompt) => prompt.id === selectedPromptId.value) ?? null
)
const selectedFilterCollection = computed(
  () => promptStore.collections.find((collection) => collection.id === collectionFilterId.value) ?? null
)

const flattenedCollections = computed(() => flattenCollections(promptStore.collections))
const collectionOptions = computed<CollectionOption[]>(() => [
  { label: 'All Collections', value: null },
  ...flattenedCollections.value.map((collection) => ({
    label:
      `${collection.label}${typeof collection.prompt_count === 'number' ? ` (${collection.prompt_count})` : ''}`,
    value: collection.id
  }))
])

const collectionParentOptions = computed<CollectionOption[]>(() => {
  const blockedIds = collectionFormMode.value === 'edit' && selectedFilterCollection.value
    ? getDescendantIds(selectedFilterCollection.value.id, promptStore.collections)
    : new Set<string>()

  if (collectionFormMode.value === 'edit' && selectedFilterCollection.value) {
    blockedIds.add(selectedFilterCollection.value.id)
  }

  return [
    { label: 'No Parent', value: null },
    ...flattenedCollections.value
      .filter((collection) => !blockedIds.has(collection.id))
      .map((collection) => ({ label: collection.label, value: collection.id }))
  ]
})

const saveTargetLabel = computed(() => {
  if (!selectedFilterCollection.value) return null
  return `Saving into ${selectedFilterCollection.value.name}`
})

watch(
  () => open.value,
  async (isOpen) => {
    if (!isOpen) {
      resetTransientState()
      return
    }

    editorText.value = generationStore.prompt
    initialText.value = generationStore.prompt
    searchQuery.value = ''
    collectionFilterId.value = null
    selectedPromptId.value = null
    showSavePromptForm.value = false
    savePromptTitle.value = ''
    resetCollectionForm()

    await Promise.all([promptStore.loadCollections(), promptStore.loadPrompts()])
    await nextTick()
    focusEditor()
  }
)

watch(
  () => promptStore.prompts,
  (prompts) => {
    if (prompts.length === 0) {
      selectedPromptId.value = null
      return
    }

    const stillSelected = prompts.some((prompt) => prompt.id === selectedPromptId.value)
    if (!stillSelected) {
      selectedPromptId.value = prompts[0]?.id ?? null
    }
  },
  { deep: false }
)

watch(
  () => promptStore.collections,
  (collections) => {
    if (collectionFilterId.value && !collections.some((collection) => collection.id === collectionFilterId.value)) {
      collectionFilterId.value = null
      void promptStore.applyFilters(searchQuery.value, null)
    }
  },
  { deep: false }
)

function flattenCollections(collections: PromptCollectionRecord[]): Array<
  PromptCollectionRecord & { label: string; depth: number }
> {
  const byParent = new Map<string | null, PromptCollectionRecord[]>()
  for (const collection of collections) {
    const siblings = byParent.get(collection.parent_id) ?? []
    siblings.push(collection)
    byParent.set(collection.parent_id, siblings)
  }

  for (const siblings of byParent.values()) {
    siblings.sort((left, right) => {
      if (left.sort_order !== right.sort_order) return left.sort_order - right.sort_order
      return left.created_at.localeCompare(right.created_at)
    })
  }

  const flattened: Array<PromptCollectionRecord & { label: string; depth: number }> = []
  const visited = new Set<string>()

  const walk = (parentId: string | null, depth: number): void => {
    for (const collection of byParent.get(parentId) ?? []) {
      if (visited.has(collection.id)) continue
      visited.add(collection.id)
      flattened.push({
        ...collection,
        depth,
        label: `${depth > 0 ? `${'— '.repeat(depth)}` : ''}${collection.name}`
      })
      walk(collection.id, depth + 1)
    }
  }

  walk(null, 0)

  for (const collection of collections) {
    if (!visited.has(collection.id)) {
      flattened.push({ ...collection, depth: 0, label: collection.name })
    }
  }

  return flattened
}

function getDescendantIds(collectionId: string, collections: PromptCollectionRecord[]): Set<string> {
  const descendants = new Set<string>()
  const childrenByParent = new Map<string | null, PromptCollectionRecord[]>()

  for (const collection of collections) {
    const children = childrenByParent.get(collection.parent_id) ?? []
    children.push(collection)
    childrenByParent.set(collection.parent_id, children)
  }

  const walk = (parentId: string): void => {
    for (const child of childrenByParent.get(parentId) ?? []) {
      if (descendants.has(child.id)) continue
      descendants.add(child.id)
      walk(child.id)
    }
  }

  walk(collectionId)
  return descendants
}

function focusEditor(): void {
  const textarea = document.querySelector<HTMLTextAreaElement>('[data-prompt-editor-input="true"]')
  textarea?.focus()
  if (textarea) {
    const end = textarea.value.length
    textarea.setSelectionRange(end, end)
  }
}

function resetTransientState(): void {
  editorText.value = ''
  initialText.value = ''
  searchQuery.value = ''
  collectionFilterId.value = null
  selectedPromptId.value = null
  showSavePromptForm.value = false
  savePromptTitle.value = ''
  savePromptPending.value = false
  resetCollectionForm()
}

function resetCollectionForm(): void {
  collectionFormMode.value = null
  collectionFormName.value = ''
  collectionFormParentId.value = null
  collectionFormPending.value = false
  collectionFormError.value = null
}

function promptTitle(prompt: PromptRecord): string {
  if (prompt.title?.trim()) {
    return prompt.title.trim()
  }

  const firstLine = prompt.text.split(/\r?\n/, 1)[0]?.trim() ?? ''
  return firstLine || 'Untitled prompt'
}

function promptPreviewLine(prompt: PromptRecord): string {
  const firstLine = prompt.text.split(/\r?\n/, 1)[0]?.trim() ?? prompt.text.trim()
  if (!firstLine) return 'Empty prompt'
  if (prompt.title?.trim()) return firstLine
  return firstLine.length > 90 ? `${firstLine.slice(0, 87)}...` : firstLine
}

function useCountLabel(prompt: PromptRecord): string {
  const countLabel = `Used ${prompt.use_count}x`
  if (!prompt.last_used_at) return countLabel
  return `${countLabel} • Last used ${new Date(prompt.last_used_at).toLocaleString()}`
}

function promptCollectionName(collectionId: string | null): string | null {
  if (!collectionId) return null
  return promptStore.collections.find((collection) => collection.id === collectionId)?.name ?? null
}

async function applyFilters(): Promise<void> {
  await promptStore.applyFilters(searchQuery.value, collectionFilterId.value)
}

async function handleSearchInput(value: string | undefined): Promise<void> {
  searchQuery.value = value ?? ''
  await applyFilters()
}

async function handleCollectionFilterChange(value: string | null): Promise<void> {
  collectionFilterId.value = value
  await applyFilters()
}

function handleLoadPrompt(prompt: PromptRecord): void {
  selectedPromptId.value = prompt.id
  editorText.value = prompt.text
}

async function copyText(text: string, successSummary: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    toast.add({ severity: 'success', summary: successSummary, life: 2500 })
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: 'Copy failed',
      detail: error instanceof Error ? error.message : String(error),
      life: 3500
    })
  }
}

function openSavePromptForm(): void {
  if (!editorText.value.trim()) return
  showSavePromptForm.value = true
  savePromptTitle.value = ''
}

async function handleSaveCurrentPrompt(): Promise<void> {
  if (!editorText.value.trim() || savePromptPending.value) return

  savePromptPending.value = true
  try {
    const created = await promptStore.createPrompt({
      text: editorText.value,
      title: savePromptTitle.value.trim() || undefined,
      collection_id: collectionFilterId.value ?? undefined
    })

    selectedPromptId.value = created.id
    showSavePromptForm.value = false
    savePromptTitle.value = ''

    toast.add({
      severity: 'success',
      summary: 'Prompt saved',
      detail: promptTitle(created),
      life: 3000
    })
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: 'Save failed',
      detail: error instanceof Error ? error.message : String(error),
      life: 3500
    })
  } finally {
    savePromptPending.value = false
  }
}

async function handlePromptRatingChange(rating: number): Promise<void> {
  if (!selectedPrompt.value) return
  await promptStore.setRating(selectedPrompt.value.id, rating)
}

async function handleUsePrompt(): Promise<void> {
  if (!editorText.value.trim()) return

  generationStore.setFormValue('prompt', editorText.value)

  initialText.value = editorText.value
  uiStore.closeModal('prompt-editor')

  if (selectedPrompt.value && editorText.value === selectedPrompt.value.text) {
    try {
      await promptStore.incrementUse(selectedPrompt.value.id)
    } catch (error) {
      toast.add({
        severity: 'warn',
        summary: 'Prompt applied',
        detail: error instanceof Error ? error.message : 'Usage count could not be updated.',
        life: 3000
      })
    }
  }
}

function handleRequestClose(): void {
  if (isDirty.value && !window.confirm('Discard changes to the current prompt?')) {
    return
  }

  uiStore.closeModal('prompt-editor')
}

function openCreateCollectionForm(): void {
  collectionFormMode.value = 'create'
  collectionFormName.value = ''
  collectionFormParentId.value = collectionFilterId.value ?? null
  collectionFormPending.value = false
  collectionFormError.value = null
}

function openEditCollectionForm(): void {
  if (!selectedFilterCollection.value) return

  collectionFormMode.value = 'edit'
  collectionFormName.value = selectedFilterCollection.value.name
  collectionFormParentId.value = selectedFilterCollection.value.parent_id
  collectionFormPending.value = false
  collectionFormError.value = null
}

async function handleSaveCollection(): Promise<void> {
  const name = collectionFormName.value.trim()
  if (!name || collectionFormPending.value) return

  collectionFormPending.value = true
  collectionFormError.value = null

  try {
    if (collectionFormMode.value === 'create') {
      const created = await promptStore.createCollection({
        name,
        parent_id: collectionFormParentId.value
      })
      collectionFilterId.value = created.id
      await applyFilters()
      resetCollectionForm()
      toast.add({ severity: 'success', summary: 'Collection created', detail: created.name, life: 3000 })
      return
    }

    if (collectionFormMode.value === 'edit' && selectedFilterCollection.value) {
      const updated = await promptStore.updateCollection(selectedFilterCollection.value.id, {
        name,
        parent_id: collectionFormParentId.value
      })

      if (updated) {
        toast.add({ severity: 'success', summary: 'Collection updated', detail: updated.name, life: 3000 })
      }
    }

    resetCollectionForm()
  } catch (error) {
    collectionFormError.value = error instanceof Error ? error.message : String(error)
  } finally {
    collectionFormPending.value = false
  }
}

async function handleDeleteCollection(): Promise<void> {
  if (!selectedFilterCollection.value || collectionFormPending.value) return

  const confirmed = window.confirm(
    `Delete the collection "${selectedFilterCollection.value.name}"? Child collections will also be removed.`
  )
  if (!confirmed) return

  collectionFormPending.value = true
  collectionFormError.value = null

  try {
    const deletedId = selectedFilterCollection.value.id
    await promptStore.deleteCollection(deletedId)
    collectionFilterId.value = null
    await applyFilters()
    resetCollectionForm()
    toast.add({ severity: 'success', summary: 'Collection deleted', life: 3000 })
  } catch (error) {
    collectionFormError.value = error instanceof Error ? error.message : String(error)
  } finally {
    collectionFormPending.value = false
  }
}

function handleSaveShortcut(): void {
  if (showSavePromptForm.value) {
    void handleSaveCurrentPrompt()
    return
  }

  openSavePromptForm()
}
</script>

<template>
  <Dialog
    v-model:visible="open"
    modal
    header="Prompt Editor"
    :style="{ width: 'min(1100px, 92vw)' }"
    :breakpoints="{ '960px': '96vw' }"
  >
    <div
      class="grid h-[70vh] min-h-0 gap-4 md:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]"
      @keydown.ctrl.enter.prevent="handleUsePrompt"
      @keydown.meta.enter.prevent="handleUsePrompt"
      @keydown.ctrl.s.prevent="handleSaveShortcut"
      @keydown.meta.s.prevent="handleSaveShortcut"
      @keydown.escape.prevent.stop="handleRequestClose"
    >
      <div class="flex min-h-0 flex-col gap-3">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-xs font-medium uppercase tracking-wide text-muted">Editor</p>
            <p class="text-xs text-muted">Compose or refine a prompt before applying it.</p>
          </div>
          <span class="text-xs text-muted">{{ editorText.length }} chars</span>
        </div>

        <Textarea
          data-prompt-editor-input="true"
          :model-value="editorText"
          auto-resize
          rows="10"
          class="h-full min-h-[20rem] w-full resize-none text-sm leading-6"
          placeholder="Write a prompt..."
          @update:model-value="(value: string | undefined) => (editorText = value ?? '')"
        />

        <div v-if="showSavePromptForm" class="rounded-lg border border-default bg-elevated p-3">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div class="flex-1">
              <label class="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">
                Title
              </label>
              <InputText
                v-model="savePromptTitle"
                class="w-full"
                maxlength="120"
                placeholder="Optional title"
                @keydown.enter.prevent="handleSaveCurrentPrompt"
              />
            </div>

            <div class="flex items-center gap-2">
              <Button
                label="Cancel"
                severity="secondary"
                outlined
                size="small"
                :disabled="savePromptPending"
                @click="showSavePromptForm = false"
              />
              <Button
                label="Save"
                size="small"
                :loading="savePromptPending"
                :disabled="!editorText.trim()"
                @click="handleSaveCurrentPrompt"
              />
            </div>
          </div>

          <p v-if="saveTargetLabel" class="mt-2 text-xs text-muted">
            {{ saveTargetLabel }}
          </p>
        </div>
      </div>

      <div class="flex min-h-0 flex-col gap-3">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-xs font-medium uppercase tracking-wide text-muted">Library</p>
            <p class="text-xs text-muted">Browse saved prompts and collections.</p>
          </div>
        </div>

        <div class="flex flex-col gap-2">
          <InputText
            :model-value="searchQuery"
            class="w-full"
            placeholder="Search prompts"
            @update:model-value="handleSearchInput"
          />

          <div class="flex items-center gap-2">
            <Select
              :model-value="collectionFilterId"
              :options="collectionOptions"
              option-label="label"
              option-value="value"
              class="min-w-0 flex-1"
              placeholder="All Collections"
              @update:model-value="handleCollectionFilterChange"
            />

            <Button
              v-tooltip.top="'Create collection'"
              type="button"
              text
              plain
              severity="secondary"
              @click="openCreateCollectionForm"
            >
              <Icon icon="lucide:folder-plus" class="size-4" />
            </Button>
            <Button
              v-tooltip.top="'Edit selected collection'"
              type="button"
              text
              plain
              severity="secondary"
              :disabled="!selectedFilterCollection"
              @click="openEditCollectionForm"
            >
              <Icon icon="lucide:folder-cog" class="size-4" />
            </Button>
          </div>
        </div>

        <div v-if="collectionFormMode" class="rounded-lg border border-default bg-elevated p-3">
          <div class="flex items-center justify-between gap-3">
            <p class="text-xs font-medium uppercase tracking-wide text-muted">
              {{ collectionFormMode === 'create' ? 'New Collection' : 'Edit Collection' }}
            </p>
            <Button
              type="button"
              text
              plain
              severity="secondary"
              size="small"
              @click="resetCollectionForm"
            >
              <Icon icon="lucide:x" class="size-4" />
            </Button>
          </div>

          <div class="mt-3 space-y-3">
            <div>
              <label class="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">
                Name
              </label>
              <InputText
                v-model="collectionFormName"
                class="w-full"
                maxlength="120"
                placeholder="Collection name"
                @keydown.enter.prevent="handleSaveCollection"
              />
            </div>

            <div>
              <label class="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">
                Parent
              </label>
              <Select
                v-model="collectionFormParentId"
                :options="collectionParentOptions"
                option-label="label"
                option-value="value"
                class="w-full"
              />
            </div>

            <p v-if="collectionFormError" class="text-sm text-red-400">{{ collectionFormError }}</p>

            <div class="flex items-center gap-2">
              <Button
                v-if="collectionFormMode === 'edit'"
                type="button"
                severity="danger"
                text
                class="mr-auto"
                :disabled="collectionFormPending"
                @click="handleDeleteCollection"
              >
                <Icon icon="lucide:trash-2" class="size-4" />
                Delete
              </Button>
              <Button
                type="button"
                label="Save"
                size="small"
                :loading="collectionFormPending"
                :disabled="!collectionFormName.trim()"
                @click="handleSaveCollection"
              />
            </div>
          </div>
        </div>

        <div class="min-h-0 flex-1 rounded-lg border border-default">
          <div v-if="promptStore.loading" class="flex h-full min-h-[14rem] items-center justify-center">
            <ProgressSpinner stroke-width="4" style="width: 2rem; height: 2rem" />
          </div>

          <div
            v-else-if="promptStore.prompts.length === 0"
            class="flex h-full min-h-[14rem] items-center justify-center px-6 text-center text-sm text-muted"
          >
            No saved prompts match the current filter.
          </div>

          <div v-else class="flex h-full min-h-[14rem] flex-col gap-2 overflow-y-auto p-2">
            <ListItem
              v-for="promptItem in promptStore.prompts"
              :key="promptItem.id"
              selectable
              :selected="promptItem.id === selectedPromptId"
              @select="selectedPromptId = promptItem.id"
              @dblclick="handleLoadPrompt(promptItem)"
            >
              <div class="truncate font-medium">{{ promptTitle(promptItem) }}</div>
              <div class="mt-0.5 truncate text-xs text-muted">{{ promptPreviewLine(promptItem) }}</div>

              <template #badge>
                <Tag v-if="promptItem.rating > 0" severity="secondary" :value="`${promptItem.rating}★`" />
              </template>
            </ListItem>
          </div>
        </div>

        <div class="rounded-lg border border-default bg-elevated p-3">
          <template v-if="selectedPrompt">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="truncate text-sm font-semibold">{{ promptTitle(selectedPrompt) }}</p>
                <p class="mt-1 text-xs text-muted">{{ useCountLabel(selectedPrompt) }}</p>
              </div>

              <Tag
                v-if="promptCollectionName(selectedPrompt.collection_id)"
                severity="secondary"
                :value="promptCollectionName(selectedPrompt.collection_id) ?? ''"
              />
            </div>

            <div class="mt-3">
              <StarRating :rating="selectedPrompt.rating" @change="handlePromptRatingChange" />
            </div>

            <div class="mt-3 max-h-40 overflow-y-auto rounded-md border border-default bg-surface-950 px-3 py-2 text-sm leading-6 whitespace-pre-wrap">
              {{ selectedPrompt.text }}
            </div>

            <div class="mt-3 flex items-center gap-2">
              <Button type="button" label="Load" @click="handleLoadPrompt(selectedPrompt)" />
              <Button
                type="button"
                label="Copy"
                severity="secondary"
                outlined
                @click="copyText(selectedPrompt.text, 'Prompt copied')"
              />
            </div>
          </template>

          <div v-else class="py-6 text-center text-sm text-muted">
            Select a saved prompt to preview it.
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <Button
        type="button"
        label="Cancel"
        severity="secondary"
        outlined
        @click="handleRequestClose"
      />
      <Button
        type="button"
        label="Use Prompt"
        :disabled="!editorText.trim()"
        @click="handleUsePrompt"
      />
      <Button
        type="button"
        label="Save"
        severity="secondary"
        :disabled="!editorText.trim()"
        @click="openSavePromptForm"
      />
    </template>
  </Dialog>
</template>