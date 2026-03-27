<script setup lang="ts">
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

function handleSearch(value: string): void {
  libraryStore.searchQuery = value
  libraryStore.loadMedia()
}
</script>

<template>
  <div class="flex items-center gap-10 bg-default px-3 h-10">
    <!-- Rating filter -->
    <div class="flex items-center gap-0.5">
      <UTooltip v-for="value in 5" :key="value" :text="`${value}+ stars`">
        <UButton
          icon="i-lucide-star"
          variant="ghost"
          size="xs"
          :color="value <= libraryStore.ratingFilter ? 'primary' : 'neutral'"
          :aria-label="`Filter ${value}+ stars`"
          @click="toggleRating(value)"
        />
      </UTooltip>
    </div>

    <!-- Status filter -->
    <div class="flex items-center gap-0.5">
      <UTooltip text="Selected only">
        <UButton
          icon="i-lucide-circle-check"
          :color="libraryStore.statusFilter === 'selected' ? 'primary' : 'neutral'"
          :variant="libraryStore.statusFilter === 'selected' ? 'subtle' : 'ghost'"
          size="xs"
          aria-label="Filter selected"
          @click="toggleStatus('selected')"
        />
      </UTooltip>
      <UTooltip text="Rejected only">
        <UButton
          icon="i-lucide-circle-x"
          :color="libraryStore.statusFilter === 'rejected' ? 'error' : 'neutral'"
          :variant="libraryStore.statusFilter === 'rejected' ? 'subtle' : 'ghost'"
          size="xs"
          aria-label="Filter rejected"
          @click="toggleStatus('rejected')"
        />
      </UTooltip>
      <UTooltip text="Unmarked only">
        <UButton
          icon="i-lucide-circle-minus"
          :color="libraryStore.statusFilter === 'unmarked' ? 'neutral' : 'neutral'"
          :variant="libraryStore.statusFilter === 'unmarked' ? 'subtle' : 'ghost'"
          size="xs"
          aria-label="Filter unmarked"
          @click="toggleStatus('unmarked')"
        />
      </UTooltip>
    </div>

    <div class="flex-1" />

    <!-- Search -->
    <UInput
      :model-value="libraryStore.searchQuery"
      placeholder="Search…"
      icon="i-lucide-search"
      size="xs"
      class="w-48"
      @update:model-value="handleSearch($event as string)"
    />
  </div>
</template>
