<script setup lang="ts">
import { Icon } from '@iconify/vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import { useLibraryStore } from '@/stores/library'
import type { MediaStatus } from '@/types'

const libraryStore = useLibraryStore()

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
