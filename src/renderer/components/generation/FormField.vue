<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Textarea from 'primevue/textarea'
import Select from 'primevue/select'
import ToggleSwitch from 'primevue/toggleswitch'
import Slider from 'primevue/slider'

import SizeSelector from './SizeSelector.vue'
import LocalSizeSelector from './LocalSizeSelector.vue'
import type { FormFieldConfig } from '@/lib/schema-to-form'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

const props = withDefaults(
  defineProps<{
    field: FormFieldConfig
    modelValue: unknown
    disabled?: boolean
    error?: string
    hideLabel?: boolean
  }>(),
  { disabled: false, hideLabel: false }
)

const emit = defineEmits<{
  'update:modelValue': [value: unknown]
}>()

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const generateRandomSeed = () => Math.floor(Math.random() * 2147483648)

const isSeedField = computed(() => props.field.name.toLowerCase() === 'seed')
const hasSliderRange = computed(
  () =>
    props.field.default !== undefined &&
    props.field.min !== undefined &&
    props.field.max !== undefined
)
const showRange = computed(
  () =>
    props.field.min !== undefined &&
    props.field.max !== undefined &&
    props.field.type !== 'size' &&
    props.field.type !== 'local-size'
)

// For numeric fields, we track a local string/number to support in-progress editing
const isNumericField = computed(() => props.field.type === 'number' || props.field.type === 'slider')
const allowEmptyNumber = computed(
  () => props.field.type === 'number' && !props.field.required && props.field.default === undefined
)

const numericValue = computed(() => {
  const v = props.modelValue
  if (v !== undefined && v !== null) return Number(v)
  return (props.field.default as number | undefined) ?? props.field.min ?? 0
})

function clamp(n: number): number {
  let next = n
  if (props.field.min !== undefined) next = Math.max(props.field.min, next)
  if (props.field.max !== undefined) next = Math.min(props.field.max, next)
  return next
}

// -- Number input local state --
const numberInput = ref<number | null>(numericValue.value)

watch(
  () => props.modelValue,
  (val) => {
    if (!isNumericField.value) return
    if (allowEmptyNumber.value && (val === undefined || val === null)) {
      numberInput.value = null
    } else {
      numberInput.value = val !== undefined && val !== null
        ? Number(val)
        : ((props.field.default as number | undefined) ?? props.field.min ?? 0)
    }
  }
)

function commitNumber(): void {
  if (numberInput.value === null || numberInput.value === undefined) {
    if (allowEmptyNumber.value) {
      emit('update:modelValue', undefined)
      return
    }
    const fallback = (props.field.default as number | undefined) ?? props.field.min ?? 0
    numberInput.value = fallback
    emit('update:modelValue', fallback)
    return
  }
  const clamped = clamp(numberInput.value)
  numberInput.value = clamped
  emit('update:modelValue', clamped)
}

function handleSliderChange(value: number): void {
  numberInput.value = value
  emit('update:modelValue', value)
}

// -- Select options --
const selectOptions = computed(() => {
  const options = (props.field.options ?? []).map((opt) => ({
    label: String(opt),
    value: opt
  }))
  if (!props.field.required) {
    options.unshift({ label: '— None —', value: undefined as unknown as string | number })
  }
  return options
})

const selectValue = computed(() => {
  if (props.modelValue !== undefined && props.modelValue !== null && props.modelValue !== '') {
    return props.modelValue
  }
  return props.field.default
})

// Size value
const sizeValue = computed({
  get: () => (props.modelValue as string) || (props.field.default as string) || '1024*1024',
  set: (v: string) => emit('update:modelValue', v)
})

// Description visible?
const showDescription = computed(
  () =>
    !props.error &&
    props.field.description &&
    !['text', 'textarea', 'size', 'local-size'].includes(props.field.type)
)
</script>

<template>
  <div class="space-y-1.5">
    <!-- Label -->
    <div v-if="!hideLabel && !field.hideLabel" class="flex items-center gap-2">
      <label :for="field.name" class="text-xs font-medium">
        {{ field.label }}
        <span v-if="field.required" class="text-red-400 ml-0.5">*</span>
      </label>
      <span v-if="showRange" class="text-xs text-muted">
        ({{ field.min }}–{{ field.max }})
      </span>
    </div>

    <!-- Text -->
    <InputText
      v-if="field.type === 'text'"
      :id="field.name"
      :model-value="(modelValue as string) || ''"
      :placeholder="field.placeholder || field.description || `Enter ${field.label.toLowerCase()}`"
      :disabled="disabled"
      :invalid="!!error"
      class="w-full"
      @update:model-value="(v: string | undefined) => emit('update:modelValue', v ?? '')"
    />

    <!-- Textarea -->
    <Textarea
      v-else-if="field.type === 'textarea'"
      :id="field.name"
      :model-value="(modelValue as string) || ''"
      :placeholder="field.placeholder || field.description || `Enter ${field.label.toLowerCase()}`"
      :disabled="disabled"
      :invalid="!!error"
      rows="4"
      auto-resize
      class="w-full"
      @update:model-value="(v: string | undefined) => emit('update:modelValue', v ?? '')"
    />

    <!-- Number with slider range -->
    <div v-else-if="field.type === 'number' && hasSliderRange" class="flex items-center gap-3">
      <Slider
        :model-value="numericValue"
        :min="field.min"
        :max="field.max"
        :step="field.step ?? 1"
        :disabled="disabled"
        class="flex-1"
        @update:model-value="(v: number | number[]) => handleSliderChange(Array.isArray(v) ? v[0] : v)"
      />
      <InputNumber
        v-model="numberInput"
        :min="field.min"
        :max="field.max"
        :step="field.step"
        :disabled="disabled"
        input-class="w-16 text-sm"
        @blur="commitNumber"
      />
    </div>

    <!-- Number without slider (e.g. seed) -->
    <div v-else-if="field.type === 'number'" class="flex items-center gap-2">
      <InputNumber
        v-model="numberInput"
        :min="field.min"
        :max="field.max"
        :step="field.step"
        :placeholder="field.default !== undefined ? `Default: ${field.default}` : 'Random'"
        :disabled="disabled"
        :invalid="!!error"
        :input-class="isSeedField ? 'w-full' : undefined"
        :class="isSeedField ? 'flex-1' : undefined"
        @blur="commitNumber"
      />
      <Button
        v-if="isSeedField"
        v-tooltip.top="'Random seed'"
        type="button"
        text
        severity="secondary"
        size="small"
        :disabled="disabled"
        @click="() => { const s = generateRandomSeed(); numberInput = s; emit('update:modelValue', s) }"
      >
        <Icon icon="lucide:dices" class="size-4" />
      </Button>
    </div>

    <!-- Slider -->
    <div v-else-if="field.type === 'slider'" class="flex items-center gap-3">
      <Slider
        :model-value="numericValue"
        :min="field.min ?? 0"
        :max="field.max ?? 100"
        :step="field.step ?? 1"
        :disabled="disabled"
        class="flex-1"
        @update:model-value="(v: number | number[]) => handleSliderChange(Array.isArray(v) ? v[0] : v)"
      />
      <InputNumber
        v-model="numberInput"
        :min="field.min"
        :max="field.max"
        :step="field.step"
        :disabled="disabled"
        input-class="w-16 text-sm"
        @blur="commitNumber"
      />
    </div>

    <!-- Boolean -->
    <div v-else-if="field.type === 'boolean'" class="flex items-center gap-2">
      <ToggleSwitch
        :id="field.name"
        :model-value="Boolean(modelValue)"
        :disabled="disabled"
        @update:model-value="(v: boolean) => emit('update:modelValue', v)"
      />
      <label :for="field.name" class="text-sm text-muted">
        {{ modelValue ? 'Enabled' : 'Disabled' }}
      </label>
    </div>

    <!-- Select -->
    <Select
      v-else-if="field.type === 'select'"
      :id="field.name"
      :model-value="selectValue"
      :options="selectOptions"
      option-label="label"
      option-value="value"
      :placeholder="`Select ${field.label.toLowerCase()}`"
      :disabled="disabled"
      :invalid="!!error"
      class="w-full"
      @update:model-value="(v: unknown) => emit('update:modelValue', v)"
    />

    <!-- Size selectors -->
    <SizeSelector
      v-else-if="field.type === 'size'"
      v-model="sizeValue"
      :disabled="disabled"
      :min="field.min"
      :max="field.max"
    />
    <LocalSizeSelector
      v-else-if="field.type === 'local-size'"
      v-model="sizeValue"
      :disabled="disabled"
      :min="field.min"
      :max="field.max"
    />

    <!-- Fallback -->
    <InputText
      v-else
      :id="field.name"
      :model-value="(modelValue as string) || ''"
      :disabled="disabled"
      class="w-full"
      @update:model-value="(v: string | undefined) => emit('update:modelValue', v ?? '')"
    />

    <!-- Error -->
    <p v-if="error" class="text-xs text-red-400">{{ error }}</p>

    <!-- Description -->
    <p v-if="showDescription" class="text-xs text-muted">{{ field.description }}</p>
  </div>
</template>
