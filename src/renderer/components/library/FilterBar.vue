<script setup lang="ts">
import { Icon } from '@iconify/vue'
import Button from 'primevue/button'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import SelectButton from 'primevue/selectbutton'
import { computed, onMounted, ref, watch } from 'vue'
import StarRating from '@/components/shared/StarRating.vue'
import { useLibraryStore } from '@/stores/library'
import type { MediaStatus, MediaType } from '@/types'

const libraryStore = useLibraryStore()

const mediaTypeOptions: { label: string; value: 'all' | MediaType; icon: string }[] = [
  { label: 'All', value: 'all', icon: 'lucide:layers-3' },
  { label: 'Image', value: 'image', icon: 'lucide:image' },
  { label: 'Video', value: 'video', icon: 'lucide:video' }
]

const modelOptions = ref<{ label: string; value: string }[]>([])

const modelOptionQuery = computed(() => ({
  ...libraryStore.buildQuery(),
  modelIdentityId: undefined,
  page: undefined,
  pageSize: undefined,
  sort: undefined,
  sortDirection: undefined
}))

watch(
  modelOptionQuery,
  () => {
    void loadModelOptions()
  },
  { deep: true }
)

watch(
  () => libraryStore.total,
  () => {
    void loadModelOptions()
  }
)

onMounted(() => {
  void loadModelOptions()
})

function setRatingFilter(value: number): void {
  libraryStore.ratingFilter = value
  void libraryStore.loadMedia()
}

function toggleStatus(status: MediaStatus | 'unmarked' | 'all'): void {
  libraryStore.statusFilter = libraryStore.statusFilter === status ? 'all' : status
  libraryStore.loadMedia()
}

function handleSearch(event: Event): void {
  const target = event.target as HTMLInputElement
  libraryStore.searchQuery = target.value
  libraryStore.loadMedia()
}

function setMediaTypeFilter(value: 'all' | MediaType): void {
  libraryStore.mediaTypeFilter = value
  libraryStore.loadMedia()
}

async function loadModelOptions(): Promise<void> {
  const options = await window.api.getLibraryModelFilterOptions(modelOptionQuery.value)
  modelOptions.value = options.map((option) => ({ label: option.name, value: option.id }))

  if (
    libraryStore.modelIdentityFilter &&
    !modelOptions.value.some((option) => option.value === libraryStore.modelIdentityFilter)
  ) {
    libraryStore.modelIdentityFilter = null
    void libraryStore.loadMedia()
  }
}

function setModelFilter(value: string | null): void {
  libraryStore.modelIdentityFilter = value
  void libraryStore.loadMedia()
}
</script>

<template>
  <div class="flex items-center gap-10 px-3 h-10 bg-surface-950">
    <!-- Rating filter -->
    <StarRating
      v-tooltip="
        libraryStore.ratingFilter > 0 ? `${libraryStore.ratingFilter}+ stars` : 'All ratings'
      "
      :rating="libraryStore.ratingFilter"
      :show-clear="false"
      @change="setRatingFilter"
    />

    <!-- Status filter -->
    <div class="flex items-center gap-0.5">
      <Button
        v-tooltip="'Selected only'"
        text
        :plain="libraryStore.statusFilter !== 'selected'"
        :severity="libraryStore.statusFilter === 'selected' ? undefined : 'secondary'"
        size="small"
        aria-label="Filter selected"
        @click="toggleStatus('selected')"
      >
        <Icon icon="lucide:circle-check" class="size-4" />
      </Button>
      <Button
        v-tooltip="'Rejected only'"
        text
        :plain="libraryStore.statusFilter !== 'rejected'"
        :severity="libraryStore.statusFilter === 'rejected' ? 'danger' : 'secondary'"
        size="small"
        aria-label="Filter rejected"
        @click="toggleStatus('rejected')"
      >
        <Icon icon="lucide:circle-x" class="size-4" />
      </Button>
      <Button
        v-tooltip="'Unmarked only'"
        text
        plain
        :severity="libraryStore.statusFilter === 'unmarked' ? undefined : 'secondary'"
        size="small"
        aria-label="Filter unmarked"
        @click="toggleStatus('unmarked')"
      >
        <Icon icon="lucide:circle-minus" class="size-4" />
      </Button>
    </div>

    <SelectButton
      :model-value="libraryStore.mediaTypeFilter"
      :options="mediaTypeOptions"
      :allow-empty="false"
      option-label="label"
      option-value="value"
      size="small"
      aria-label="Filter media type"
      @update:model-value="setMediaTypeFilter($event as 'all' | MediaType)"
    >
      <template #option="slotProps">
        <div class="flex items-center gap-1.5">
          <Icon :icon="slotProps.option.icon" class="size-3.5" />
          <span>{{ slotProps.option.label }}</span>
        </div>
      </template>
    </SelectButton>

    <Select
      :model-value="libraryStore.modelIdentityFilter"
      :options="modelOptions"
      option-label="label"
      option-value="value"
      placeholder="All models"
      show-clear
      size="small"
      class="w-48"
      :disabled="modelOptions.length <= 1 && !libraryStore.modelIdentityFilter"
      @update:model-value="setModelFilter"
    />

    <div class="flex-1" />

    <!-- Search -->
    <IconField class="w-48">
      <InputIcon>
        <Icon icon="lucide:search" class="size-3.5" />
      </InputIcon>
      <InputText
        :value="libraryStore.searchQuery"
        placeholder="Search…"
        size="small"
        class="w-full"
        @input="handleSearch"
      />
    </IconField>
  </div>
</template>
