<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Skeleton from 'primevue/skeleton'
import Tag from 'primevue/tag'

import { useModelBrowsingStore } from '@/stores/model-browsing'
import type { ProviderModel, SearchResultModel } from '@/types'

const props = defineProps<{
  providerId: string
  browseMode: 'search' | 'list'
  addedModelIds: Set<string>
}>()

const browsingStore = useModelBrowsingStore()

// ── Shared state ──────────────────────────────────────────────────────────────
const query = ref('')
const addingIds = ref(new Set<string>())
const errorIds = ref(new Set<string>())

// Reset when provider changes
watch(
  () => props.providerId,
  () => {
    query.value = ''
    addingIds.value = new Set()
    errorIds.value = new Set()
    // For list mode, load on provider switch
    if (props.browseMode === 'list') {
      void browsingStore.listModels(props.providerId)
    }
  },
  { immediate: true }
)

// ── Search mode: debounced search ─────────────────────────────────────────────
let debounceTimer: ReturnType<typeof setTimeout> | null = null

watch(query, (q) => {
  if (debounceTimer) clearTimeout(debounceTimer)
  if (!q.trim() || props.browseMode !== 'search') return
  debounceTimer = setTimeout(() => {
    void browsingStore.searchModels(props.providerId, q.trim())
  }, 400)
})

// ── Computed models ───────────────────────────────────────────────────────────
const isLoading = computed(() =>
  props.browseMode === 'search'
    ? browsingStore.searchLoading[props.providerId] ?? false
    : browsingStore.listLoading[props.providerId] ?? false
)

const models = computed<Array<SearchResultModel | ProviderModel>>(() => {
  if (props.browseMode === 'search') {
    return browsingStore.searchResults[props.providerId]?.models ?? []
  }
  const all = browsingStore.listCache[props.providerId] ?? []
  if (!query.value.trim()) return all
  const q = query.value.toLowerCase()
  return all.filter(
    (m) =>
      m.name.toLowerCase().includes(q) ||
      m.modelId.toLowerCase().includes(q) ||
      m.description?.toLowerCase().includes(q)
  )
})

const emptyMessage = computed(() => {
  if (props.browseMode === 'search') {
    return query.value.trim() ? `No models found for "${query.value}"` : 'Type to search for models'
  }
  const all = browsingStore.listCache[props.providerId] ?? []
  return all.length > 0 ? 'No models match your filter' : 'No models available'
})

// ── Add model ─────────────────────────────────────────────────────────────────
async function handleAdd(model: SearchResultModel | ProviderModel): Promise<void> {
  addingIds.value = new Set(addingIds.value).add(model.modelId)
  const nextErrors = new Set(errorIds.value)
  nextErrors.delete(model.modelId)
  errorIds.value = nextErrors

  try {
    // For search results, try to fetch full detail (with schema) first
    let providerModel: ProviderModel
    if (!('requestSchema' in model)) {
      let detail: ProviderModel | null = null
      try {
        detail = await window.api.providers.fetchModelDetail(props.providerId, model.modelId)
      } catch {
        // fall through to stub
      }
      providerModel = detail ?? {
        modelId: model.modelId,
        name: model.name,
        description: model.description,
        type: model.type,
        providerId: props.providerId,
        requestSchema: {
          properties: { prompt: { type: 'string', title: 'Prompt' } },
          required: ['prompt'],
          order: ['prompt']
        }
      }
    } else {
      providerModel = {
        modelId: model.modelId,
        name: model.name,
        description: model.description,
        type: model.type,
        providerId: props.providerId,
        requestSchema: model.requestSchema
      }
    }
    await browsingStore.addUserModel(props.providerId, providerModel)
  } catch {
    errorIds.value = new Set(errorIds.value).add(model.modelId)
  } finally {
    const next = new Set(addingIds.value)
    next.delete(model.modelId)
    addingIds.value = next
  }
}
</script>

<template>
  <div class="space-y-2">
    <!-- Search / filter input -->
    <div class="relative">
      <Icon
        icon="lucide:search"
        class="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted"
      />
      <InputText
        v-model="query"
        :placeholder="browseMode === 'search' ? 'Search models…' : 'Filter models…'"
        class="w-full !pl-8"
      />
    </div>

    <!-- Results container -->
    <div class="h-[240px] overflow-y-auto rounded-md border border-default">
      <!-- Loading -->
      <div v-if="isLoading" class="space-y-1.5 p-2">
        <Skeleton v-for="i in 3" :key="i" height="3.5rem" class="w-full rounded-md" />
      </div>

      <!-- Empty state -->
      <div
        v-else-if="models.length === 0"
        class="flex h-full items-center justify-center text-xs text-muted"
      >
        {{ emptyMessage }}
      </div>

      <!-- Model list -->
      <div v-else class="space-y-1 p-1">
        <div
          v-for="model in models"
          :key="model.modelId"
          class="flex items-center gap-2 rounded-md border border-transparent px-3 py-2 text-sm hover:bg-emphasis"
        >
          <div class="flex min-w-0 flex-1 items-center gap-1.5 truncate">
            <span class="truncate">{{ model.name }}</span>
            <template v-if="model.modelId !== model.name">
              <span class="shrink-0 opacity-30">·</span>
              <span class="truncate text-muted">{{ model.modelId }}</span>
            </template>
            <Tag
              v-if="model.type"
              severity="secondary"
              class="ml-0.5 shrink-0 text-[10px]"
              :value="model.type"
            />
          </div>

          <!-- Error / retry -->
          <Tag
            v-if="errorIds.has(model.modelId)"
            severity="danger"
            class="cursor-pointer gap-1"
            @click="handleAdd(model)"
          >
            <Icon icon="lucide:alert-circle" class="size-3" />
            Retry
          </Tag>

          <!-- Already added -->
          <Tag v-else-if="addedModelIds.has(model.modelId)" severity="success" class="gap-1">
            <Icon icon="lucide:check" class="size-3" />
            Added
          </Tag>

          <!-- Add button -->
          <Button
            v-else
            outlined
            severity="secondary"
            size="small"
            :disabled="addingIds.has(model.modelId)"
            :loading="addingIds.has(model.modelId)"
            @click="handleAdd(model)"
          >
            <Icon v-if="!addingIds.has(model.modelId)" icon="lucide:plus" class="mr-1 size-3" />
            Add
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>
