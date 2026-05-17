<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import Select from 'primevue/select'
import SelectButton from 'primevue/selectbutton'
import Tag from 'primevue/tag'

import PaneBody from '@/components/panes/primitives/PaneBody.vue'
import PaneGate from '@/components/panes/primitives/PaneGate.vue'
import PaneLayout from '@/components/panes/primitives/PaneLayout.vue'
import { useGenerationStore } from '@/stores/generation'
import { useProviderStore } from '@/stores/provider'
import { useUIStore } from '@/stores/ui'
import { formatRelative } from '@/lib/format'
import type { GenerationRecord, GenerationStatus } from '@/types'

const generationStore = useGenerationStore()
const providerStore = useProviderStore()
const uiStore = useUIStore()

interface FilterOption {
  label: string
  value: string
}

type TimelineStatusFilter = 'all' | 'completed' | 'failed'

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

const providerFilter = ref<string | null>(null)
const modelFilter = ref<string | null>(null)
const statusFilter = ref<TimelineStatusFilter>('all')

const statusOptions: Array<{ label: string; value: TimelineStatusFilter }> = [
  { label: 'all', value: 'all' },
  { label: 'success', value: 'completed' },
  { label: 'failed', value: 'failed' }
]

onMounted(() => {
  void providerStore.loadProviders()
})

const providerDisplayNames = computed<Record<string, string>>(() => ({
  local: 'Local',
  ...Object.fromEntries(
    providerStore.providers.map((provider) => [
      provider.providerId,
      provider.displayName ?? provider.providerId
    ])
  )
}))

const generationsForProviderOptions = computed(() =>
  generationStore.generations.filter((gen) => {
    if (!statusMatches(gen)) return false
    if (modelFilter.value && modelFilterKey(gen) !== modelFilter.value) return false
    return true
  })
)

const generationsForModelOptions = computed(() =>
  generationStore.generations.filter((gen) => {
    if (!statusMatches(gen)) return false
    if (providerFilter.value && providerFilterKey(gen) !== providerFilter.value) return false
    return true
  })
)

const providerOptions = computed<FilterOption[]>(() =>
  uniqueOptions(generationsForProviderOptions.value, providerFilterKey, providerLabel)
)

const modelOptions = computed<FilterOption[]>(() =>
  uniqueOptions(
    generationsForModelOptions.value.filter(hasCanonicalModelIdentity),
    modelFilterKey,
    modelLabel
  )
)

const filteredGenerations = computed(() =>
  generationStore.generations.filter((gen) => {
    if (!statusMatches(gen)) return false
    if (providerFilter.value && providerFilterKey(gen) !== providerFilter.value) return false
    if (modelFilter.value && modelFilterKey(gen) !== modelFilter.value) return false
    return true
  })
)

watch(providerOptions, (options) => {
  if (providerFilter.value && !options.some((option) => option.value === providerFilter.value)) {
    providerFilter.value = null
  }
})

watch(modelOptions, (options) => {
  if (modelFilter.value && !options.some((option) => option.value === modelFilter.value)) {
    modelFilter.value = null
  }
})

function uniqueOptions(
  generations: GenerationRecord[],
  getValue: (gen: GenerationRecord) => string,
  getLabel: (gen: GenerationRecord) => string
): FilterOption[] {
  const options = new Map<string, string>()
  for (const gen of generations) {
    const value = getValue(gen)
    if (!options.has(value)) options.set(value, getLabel(gen))
  }
  return Array.from(options, ([value, label]) => ({ value, label })).sort((a, b) =>
    a.label.localeCompare(b.label)
  )
}

function providerFilterKey(gen: GenerationRecord): string {
  return gen.provider || 'local'
}

function providerLabel(gen: GenerationRecord): string {
  const provider = providerFilterKey(gen)
  return providerDisplayNames.value[provider] ?? provider
}

function modelFilterKey(gen: GenerationRecord): string {
  if (gen.canonical_model_id) return `identity:${gen.canonical_model_id}`
  if (gen.model_file) return `provider:${providerFilterKey(gen)}:${gen.model_file}`
  return 'unknown'
}

function modelLabel(gen: GenerationRecord): string {
  return gen.canonical_model_name ?? gen.model_file ?? 'Unknown model'
}

function hasCanonicalModelIdentity(gen: GenerationRecord): boolean {
  return Boolean(gen.canonical_model_id && gen.canonical_model_name)
}

function statusMatches(gen: GenerationRecord): boolean {
  return statusFilter.value === 'all' || gen.status === statusFilter.value
}

// ---------------------------------------------------------------------------
// Thumbnails — batch-fetched whenever the filtered generation list changes
// ---------------------------------------------------------------------------

const thumbs = ref<Record<string, string>>({})

watch(
  () => filteredGenerations.value,
  async (gens) => {
    const ids = gens.map((g) => g.id)
    if (ids.length === 0) {
      thumbs.value = {}
      return
    }
    thumbs.value = await window.api.timeline.getThumbnailsBatch(ids).catch(() => ({}))
  },
  { immediate: true }
)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusSeverity(status: GenerationStatus): 'success' | 'danger' | 'secondary' {
  if (status === 'completed') return 'success'
  if (status === 'failed') return 'danger'
  return 'secondary'
}

function formatTime(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`
}

function openDetail(gen: GenerationRecord): void {
  generationStore.setDetailGenerationId(gen.id)
  uiStore.openModal('generation-detail')
}
</script>

<template>
  <PaneLayout title="Timeline">
    <PaneGate v-if="generationStore.generations.length === 0" message="No generations yet" />

    <PaneBody v-else>
      <div class="mb-3 grid grid-cols-1 gap-2">
        <SelectButton
          v-model="statusFilter"
          :options="statusOptions"
          option-label="label"
          option-value="value"
          :allow-empty="false"
          class="w-full"
        />
        <Select
          v-model="providerFilter"
          :options="providerOptions"
          option-label="label"
          option-value="value"
          placeholder="All providers"
          show-clear
          class="w-full"
          :disabled="providerOptions.length <= 1 && !providerFilter"
        />
        <Select
          v-model="modelFilter"
          :options="modelOptions"
          option-label="label"
          option-value="value"
          placeholder="All models"
          show-clear
          class="w-full"
          :disabled="modelOptions.length <= 1 && !modelFilter"
        />
      </div>

      <PaneGate
        v-if="filteredGenerations.length === 0"
        message="No generations match these filters"
      />

      <div class="space-y-2">
        <div
          v-for="gen in filteredGenerations"
          :key="gen.id"
          class="cursor-pointer rounded-lg border border-default bg-elevated p-2.5 transition-colors hover:bg-hover"
          @click="openDetail(gen)"
        >
          <div class="min-w-0 space-y-2">
            <!-- Status row -->
            <div class="flex items-center justify-between gap-2">
              <div class="flex min-w-0 items-center gap-2">
                <Tag
                  :value="gen.status"
                  :severity="statusSeverity(gen.status)"
                  class="text-[10px] capitalize"
                />
                <span class="shrink-0 text-xs font-medium text-muted">#{{ gen.number }}</span>
              </div>
              <span class="shrink-0 text-xs text-muted">{{ formatRelative(gen.created_at) }}</span>
            </div>

            <!-- Model + time -->
            <div class="flex min-w-0 items-center gap-2 text-xs text-muted">
              <span class="min-w-0 flex-1 truncate">
                {{ modelLabel(gen) }} - {{ providerLabel(gen) }}
              </span>
              <span v-if="gen.total_time_ms" class="shrink-0 tabular-nums">
                {{ formatTime(gen.total_time_ms) }}
              </span>
            </div>

            <!-- Error -->
            <div v-if="gen.error" class="truncate text-xs text-red-400">
              {{ gen.error }}
            </div>

            <!-- Thumbnail -->
            <div v-if="thumbs[gen.id]" class="flex justify-start">
              <div
                class="relative size-20 overflow-hidden rounded border border-default bg-elevated p-1"
              >
                <img
                  :src="thumbs[gen.id]"
                  :alt="`Output for #${gen.number}`"
                  class="size-full object-contain"
                  draggable="false"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </PaneBody>
  </PaneLayout>
</template>
