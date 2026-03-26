<script setup lang="ts">
defineProps<{
  rating: number
}>()

const emit = defineEmits<{
  change: [rating: number]
}>()
</script>

<template>
  <div class="flex items-center gap-0.5">
    <UTooltip v-for="value in 5" :key="value" :text="`Rate ${value}`">
      <UButton
        icon="i-lucide-star"
        variant="ghost"
        size="xs"
        :color="value <= rating ? 'primary' : 'neutral'"
        :aria-label="`Set rating ${value}`"
        @click="emit('change', value)"
      />
    </UTooltip>
    <UTooltip v-if="rating > 0" text="Clear rating">
      <UButton
        icon="i-lucide-x"
        variant="ghost"
        size="xs"
        color="neutral"
        class="ml-1"
        aria-label="Clear rating"
        @click="emit('change', 0)"
      />
    </UTooltip>
  </div>
</template>
