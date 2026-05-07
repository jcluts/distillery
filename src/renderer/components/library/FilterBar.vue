<script setup lang="ts">
import { Icon } from '@iconify/vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import SelectButton from 'primevue/selectbutton'
import { useLibraryStore } from '@/stores/library'
import type { MediaStatus, MediaType } from '@/types'

const libraryStore = useLibraryStore()

const mediaTypeOptions: { label: string; value: 'all' | MediaType; icon: string }[] = [
  { label: 'All', value: 'all', icon: 'lucide:layers-3' },
  { label: 'Image', value: 'image', icon: 'lucide:image' },
  { label: 'Video', value: 'video', icon: 'lucide:video' }
]

function toggleRating(value: number): void {
  libraryStore.ratingFilter = libraryStore.ratingFilter === value ? 0 : value
  libraryStore.loadMedia()
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
</script>

<template>
  <div class="flex items-center gap-10 px-3 h-10 bg-surface-950">
    <!-- Rating filter -->
    <div class="flex items-center gap-0.5">
      <Button
        v-for="value in 5"
        :key="value"
        v-tooltip="`${value}+ stars`"
        text
        plain
        :severity="value <= libraryStore.ratingFilter ? undefined : 'secondary'"
        size="small"
        :aria-label="`Filter ${value}+ stars`"
        @click="toggleRating(value)"
      >
        <Icon icon="lucide:star" class="size-4" />
      </Button>
    </div>

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
