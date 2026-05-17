<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { schemaToFormFields, getDefaultValues, type FormFieldConfig } from '@/lib/schema-to-form'
import FormField from './FormField.vue'
import AspectMegapixelsSelector from './AspectMegapixelsSelector.vue'
import LocalSizeSelector from './LocalSizeSelector.vue'
import type { CanonicalEndpointDef } from '@/types'

type WidthHeightControl = { width: FormFieldConfig; height: FormFieldConfig } | null
type DimensionBounds = { min: number; max?: number }

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

const props = withDefaults(
  defineProps<{
    endpoint: CanonicalEndpointDef
    values: Record<string, unknown>
    validationErrors?: Record<string, string>
    disabled?: boolean
  }>(),
  { disabled: false, validationErrors: () => ({}) }
)

const emit = defineEmits<{
  change: [key: string, value: unknown]
  setDefaults: [defaults: Record<string, unknown>]
  fieldsChange: [fields: FormFieldConfig[]]
}>()

// ---------------------------------------------------------------------------
// Fields derived from endpoint schema
// ---------------------------------------------------------------------------

const fields = computed<FormFieldConfig[]>(() => {
  const schema = props.endpoint.requestSchema
  if (!schema?.properties) return []
  return schemaToFormFields(schema.properties, schema.required || [], schema.order)
})

const visibleFields = computed(() => fields.value.filter((f) => !f.hidden))
const advancedFields = computed(() => fields.value.filter((f) => f.hidden))
const aspectMegapixelsControl = computed(() => {
  const aspectRatio = fields.value.find((field) => !field.hidden && field.name === 'aspect_ratio')
  const megapixels = fields.value.find(
    (field) => !field.hidden && (field.name === 'megapixels' || field.name === 'output_megapixels')
  )

  if (!aspectRatio || !megapixels) return null
  return { aspectRatio, megapixels }
})
const widthHeightControl = computed(() => getWidthHeightControl(fields.value))
const widthHeightBounds = computed(() => getWidthHeightBounds(widthHeightControl.value))
const widthHeightSizeValue = computed(() =>
  getWidthHeightSizeValue(widthHeightControl.value, props.values)
)
const visibleFormFields = computed(() => {
  const bundledNames = new Set([
    ...(aspectMegapixelsControl.value
      ? [
          aspectMegapixelsControl.value.aspectRatio.name,
          aspectMegapixelsControl.value.megapixels.name
        ]
      : []),
    ...(widthHeightControl.value
      ? [widthHeightControl.value.width.name, widthHeightControl.value.height.name]
      : [])
  ])

  return visibleFields.value.filter((field) => !bundledNames.has(field.name))
})

// ---------------------------------------------------------------------------
// Initialize defaults when endpoint changes
// ---------------------------------------------------------------------------

const initializedKey = ref<string | null>(null)
const advancedOpen = ref(false)

watch(
  () => [fields.value, props.endpoint.endpointKey] as const,
  ([currentFields, key]) => {
    emit('fieldsChange', currentFields)

    const defaults = {
      ...getDefaultValues(currentFields),
      ...getWidthHeightDefaultValues(currentFields, props.values)
    }
    const missingDefaults = Object.fromEntries(
      Object.entries(defaults).filter(([defaultKey]) => {
        const value = props.values[defaultKey]
        return value === undefined || value === null || value === ''
      })
    )

    if (initializedKey.value !== key && Object.keys(missingDefaults).length > 0) {
      emit('setDefaults', missingDefaults)
    }
    initializedKey.value = key
  },
  { immediate: true }
)

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

function handleChange(key: string, value: unknown): void {
  emit('change', key, value)
}

function handleWidthHeightChange(value: string): void {
  const control = widthHeightControl.value
  if (!control) return

  const parsed = parseSizeString(value)
  if (!parsed) return

  emit('change', control.width.name, parsed.w)
  emit('change', control.height.name, parsed.h)
}

function getWidthHeightControl(fields: FormFieldConfig[]): WidthHeightControl {
  const width = fields.find((field) => isPixelDimensionField(field, 'width'))
  const height = fields.find((field) => isPixelDimensionField(field, 'height'))
  if (!width || !height) return null
  return { width, height }
}

function isPixelDimensionField(field: FormFieldConfig, name: 'width' | 'height'): boolean {
  return !field.hidden && field.name.toLowerCase() === name && isNumberLikeField(field)
}

function isNumberLikeField(field: FormFieldConfig): boolean {
  return field.type === 'number' || field.type === 'slider'
}

function getWidthHeightBounds(control: WidthHeightControl): DimensionBounds {
  const min = Math.max(control?.width.min ?? 1, control?.height.min ?? 1)
  const max = Math.min(control?.width.max ?? Infinity, control?.height.max ?? Infinity)
  return {
    min,
    max: Number.isFinite(max) ? max : undefined
  }
}

function getWidthHeightSizeValue(
  control: WidthHeightControl,
  values: Record<string, unknown>
): string {
  if (!control) return '1024*1024'
  const bounds = getWidthHeightBounds(control)
  const width = getDimensionValue(values[control.width.name], control.width.default, bounds)
  const height = getDimensionValue(values[control.height.name], control.height.default, bounds)
  return `${width}*${height}`
}

function getWidthHeightDefaultValues(
  fields: FormFieldConfig[],
  values: Record<string, unknown>
): Record<string, unknown> {
  const control = getWidthHeightControl(fields)
  if (!control) return {}

  const defaults: Record<string, unknown> = {}
  const bounds = getWidthHeightBounds(control)
  if (isMissing(values[control.width.name])) {
    defaults[control.width.name] = getDimensionValue(undefined, control.width.default, bounds)
  }
  if (isMissing(values[control.height.name])) {
    defaults[control.height.name] = getDimensionValue(undefined, control.height.default, bounds)
  }
  return defaults
}

function getDimensionValue(value: unknown, fallback: unknown, bounds: DimensionBounds): number {
  const parsed = parseNumber(value) ?? parseNumber(fallback) ?? 1024
  return clamp(parsed, bounds.min, bounds.max)
}

function parseNumber(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function parseSizeString(value: string): { w: number; h: number } | null {
  const parts = value.includes('*') ? value.split('*') : value.toLowerCase().split('x')
  const w = Number(parts[0])
  const h = Number(parts[1])
  return parts.length === 2 && Number.isFinite(w) && Number.isFinite(h) ? { w, h } : null
}

function clamp(value: number, min: number, max?: number): number {
  const upperBounded = max === undefined ? value : Math.min(value, max)
  return Math.max(min, upperBounded)
}

function isMissing(value: unknown): boolean {
  return value === undefined || value === null || value === ''
}
</script>

<template>
  <div v-if="fields.length === 0" class="py-8 text-center text-sm text-muted">
    No configurable parameters for this model.
  </div>

  <div v-else class="space-y-4">
    <AspectMegapixelsSelector
      v-if="aspectMegapixelsControl"
      :aspect-ratio="values[aspectMegapixelsControl.aspectRatio.name]"
      :megapixels="values[aspectMegapixelsControl.megapixels.name]"
      :aspect-options="aspectMegapixelsControl.aspectRatio.options"
      :megapixel-options="aspectMegapixelsControl.megapixels.options"
      :disabled="disabled"
      @update:aspect-ratio="(v) => handleChange(aspectMegapixelsControl!.aspectRatio.name, v)"
      @update:megapixels="(v) => handleChange(aspectMegapixelsControl!.megapixels.name, v)"
    />

    <LocalSizeSelector
      v-if="widthHeightControl"
      :model-value="widthHeightSizeValue"
      :disabled="disabled"
      :min="widthHeightBounds.min"
      :max="widthHeightBounds.max"
      show-computed
      @update:model-value="handleWidthHeightChange"
    />

    <!-- Visible fields -->
    <FormField
      v-for="field in visibleFormFields"
      :key="field.name"
      :field="field"
      :model-value="values[field.name]"
      :disabled="disabled"
      :error="validationErrors[field.name]"
      @update:model-value="(v) => handleChange(field.name, v)"
    />

    <!-- Advanced (hidden) fields — collapsible -->
    <div v-if="advancedFields.length > 0">
      <button
        type="button"
        :disabled="disabled"
        class="flex w-full items-center gap-1.5 py-1 text-xs text-muted transition-colors hover:text-surface-0"
        @click="advancedOpen = !advancedOpen"
      >
        <Icon
          icon="lucide:chevron-right"
          class="size-3.5 transition-transform duration-200"
          :class="{ 'rotate-90': advancedOpen }"
        />
        Advanced
      </button>

      <div v-show="advancedOpen" class="space-y-4 pt-2">
        <FormField
          v-for="field in advancedFields"
          :key="field.name"
          :field="field"
          :model-value="values[field.name]"
          :disabled="disabled"
          :error="validationErrors[field.name]"
          @update:model-value="(v) => handleChange(field.name, v)"
        />
      </div>
    </div>
  </div>
</template>
