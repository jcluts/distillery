<script setup lang="ts">
defineProps<{
  label: string
}>()
</script>

<template>
  <div class="space-y-1">
    <p class="text-xs text-muted">{{ label }}</p>
    <slot />
  </div>
</template>
