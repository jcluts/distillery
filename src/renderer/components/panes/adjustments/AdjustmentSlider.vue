<script setup lang="ts">
import { computed } from 'vue'

import type { AdjustmentSliderConfig } from '@/lib/adjustment-constants'

const props = defineProps<{
  config: AdjustmentSliderConfig
  modelValue: number
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: number]
  reset: []
}>()

const isModified = computed(() => props.modelValue !== props.config.default)

function handleUpdate(value: number | number[] | undefined): void {
  const nextValue = Array.isArray(value) ? value[0] : value
  if (typeof nextValue === 'number') {
    emit('update:modelValue', nextValue)
  }
}
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <div class="flex items-center justify-between gap-3">
      <span class="text-xs text-muted">{{ config.label }}</span>
      <button
        type="button"
        class="text-xs tabular-nums"
        :class="[
          isModified && !disabled ? 'cursor-pointer text-primary' : 'text-muted',
          disabled ? 'cursor-default opacity-60' : ''
        ]"
        :disabled="disabled || !isModified"
        @click="emit('reset')"
      >
        {{ config.format(modelValue) }}
      </button>
    </div>

    <USlider
      :model-value="modelValue"
      :min="config.min"
      :max="config.max"
      :step="config.step"
      :disabled="disabled"
      @update:model-value="handleUpdate"
    />
  </div>
</template>