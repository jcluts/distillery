<script setup lang="ts">
import { Icon } from '@iconify/vue'
import Button from 'primevue/button'

defineProps<{
  rating: number
}>()

const emit = defineEmits<{
  change: [rating: number]
}>()
</script>

<template>
  <div class="flex items-center gap-0.5">
    <Button
      v-for="value in 5"
      :key="value"
      v-tooltip="`Rate ${value}`"
      text
      plain
      :severity="value <= rating ? undefined : 'secondary'"
      size="small"
      :aria-label="`Set rating ${value}`"
      @click="emit('change', value)"
    >
      <Icon icon="lucide:star" class="size-4" />
    </Button>
    <Button
      v-if="rating > 0"
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
