<script setup lang="ts">
withDefaults(
  defineProps<{
    /** Stack buttons vertically (full-width) instead of side-by-side (equal-width) */
    stack?: boolean
  }>(),
  { stack: false }
)
</script>

<template>
  <div
    :class="[
      'flex',
      stack
        ? 'flex-col gap-2 [&>*]:justify-center'
        : 'gap-2 [&>*]:min-w-0 [&>*]:flex-1 [&>*]:justify-center'
    ]"
  >
    <slot />
  </div>
</template>
