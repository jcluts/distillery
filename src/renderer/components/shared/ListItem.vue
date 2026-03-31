<script setup lang="ts">
import { useSlots } from 'vue'

withDefaults(
  defineProps<{
    /** Enables radio-style selection highlighting */
    selectable?: boolean
    /** Whether this item is currently selected (only meaningful when selectable) */
    selected?: boolean
    draggable?: boolean
    dragOver?: boolean
  }>(),
  {
    selectable: false,
    selected: false,
    draggable: false,
    dragOver: false
  }
)

defineEmits<{
  select: []
}>()

const slots = useSlots()
</script>

<template>
  <div
    class="group/item flex items-center gap-2 rounded-md border px-2.5 py-2 text-sm transition-colors"
    :class="[
      selectable && selected
        ? 'border-primary/40 bg-primary/10'
        : selectable
          ? 'border-transparent text-muted hover:bg-elevated hover:text-default'
          : 'border-default hover:bg-elevated',
      dragOver && '!border-primary !bg-primary/10',
      selectable && 'cursor-pointer'
    ]"
    :draggable="draggable"
    @click="$emit('select')"
  >
    <div v-if="slots.icon" class="flex shrink-0 items-center">
      <slot name="icon" />
    </div>

    <div class="min-w-0 flex-1">
      <slot />
    </div>

    <div
      v-if="slots.actions"
      class="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/item:opacity-100"
    >
      <slot name="actions" />
    </div>

    <div v-if="slots.badge" class="shrink-0">
      <slot name="badge" />
    </div>
  </div>
</template>
