<script setup lang="ts">
defineProps<{
  title: string
}>()
</script>

<template>
  <div class="flex h-full min-w-0 flex-col overflow-hidden">
    <div class="flex shrink-0 px-4 h-10 items-center">
      <h2 class="truncate text-xs font-semibold tracking-[0.12em] uppercase">
        {{ title }}
      </h2>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto px-4 py-4">
      <slot />
    </div>
  </div>
</template>