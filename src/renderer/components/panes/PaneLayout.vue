<script setup lang="ts">
defineProps<{
  title: string
}>()
</script>

<template>
  <div class="flex h-full min-w-0 flex-col overflow-hidden">
    <div class="shrink-0 border-b border-default px-4 py-3">
      <h2 class="truncate text-xs font-semibold tracking-[0.12em] text-toned uppercase">
        {{ title }}
      </h2>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto px-4 py-4">
      <slot />
    </div>
  </div>
</template>