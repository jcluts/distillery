<script setup lang="ts">
import { useSlots } from 'vue'

defineProps<{
  title: string
}>()

const slots = useSlots()
</script>

<template>
  <div class="flex h-full min-w-0 flex-col overflow-hidden">
    <div class="flex shrink-0 px-4 h-10 items-center gap-2">
      <h2 class="min-w-0 flex-1 truncate text-xs font-semibold tracking-[0.12em] uppercase">
        {{ title }}
      </h2>
      <div v-if="slots.actions" class="shrink-0">
        <slot name="actions" />
      </div>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto px-4 py-4">
      <slot />
    </div>
  </div>
</template>
