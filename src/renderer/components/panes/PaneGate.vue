<script setup lang="ts">
defineProps<{
  message: string
}>()
</script>

<template>
  <div class="flex items-center justify-center px-4 py-8 text-sm text-muted">
    {{ message }}
  </div>
</template>
