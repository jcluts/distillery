<script setup lang="ts">
defineProps<{
  selected?: boolean
  draggable?: boolean
  dragOver?: boolean
}>()

defineEmits<{
  select: []
}>()
</script>

<template>
  <button
    type="button"
    class="group/item flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left text-sm transition-colors"
    :class="[
      selected
        ? 'border-[color:var(--p-primary-color)]/40 bg-[color:var(--p-primary-color)]/10 text-default'
        : 'border-transparent text-muted hover:border-default hover:bg-elevated hover:text-default',
      dragOver && 'border-[color:var(--p-primary-color)] bg-[color:var(--p-primary-color)]/10'
    ]"
    :draggable="draggable"
    @click="$emit('select')"
  >
    <slot />
  </button>
</template>
