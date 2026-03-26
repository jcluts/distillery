<script setup lang="ts">
defineProps<{
  title: string
}>()
</script>

<template>
  <div class="space-y-1.5">
    <p class="text-xs font-medium tracking-wider text-toned uppercase">{{ title }}</p>
    <slot />
  </div>
</template>
