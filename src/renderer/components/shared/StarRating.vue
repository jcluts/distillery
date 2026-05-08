<script setup lang="ts">
import { Icon } from '@iconify/vue'
import Button from 'primevue/button'
import Rating from 'primevue/rating'

withDefaults(
  defineProps<{
    rating: number
    showClear?: boolean
  }>(),
  {
    showClear: true
  }
)

const emit = defineEmits<{
  change: [rating: number]
}>()

function handleRatingUpdate(value: number | null): void {
  emit('change', value ?? 0)
}
</script>

<template>
  <div class="flex items-center gap-1">
    <Rating :model-value="rating" :stars="5" @update:model-value="handleRatingUpdate" />
    <Button
      v-if="showClear && rating > 0"
      v-tooltip="'Clear rating'"
      text
      plain
      severity="secondary"
      size="small"
      class="ml-1"
      aria-label="Clear rating"
      @click="emit('change', 0)"
    >
      <Icon icon="lucide:x" class="size-4" />
    </Button>
  </div>
</template>
