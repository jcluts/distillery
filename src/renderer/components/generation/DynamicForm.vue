<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { schemaToFormFields, getDefaultValues, type FormFieldConfig } from '@/lib/schema-to-form'
import FormField from './FormField.vue'
import type { CanonicalEndpointDef } from '@/types'

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

// ---------------------------------------------------------------------------
// Initialize defaults when endpoint changes
// ---------------------------------------------------------------------------

const initializedKey = ref<string | null>(null)
const advancedOpen = ref(false)

watch(
  () => [fields.value, props.endpoint.endpointKey] as const,
  ([currentFields, key]) => {
    emit('fieldsChange', currentFields)

    const defaults = getDefaultValues(currentFields)
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
</script>

<template>
  <div v-if="fields.length === 0" class="py-8 text-center text-sm text-muted">
    No configurable parameters for this model.
  </div>

  <div v-else class="space-y-4">
    <!-- Visible fields -->
    <FormField
      v-for="field in visibleFields"
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
