<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import Button from 'primevue/button'
import Textarea from 'primevue/textarea'
import Tag from 'primevue/tag'

import PaneLayout from '@/components/panes/primitives/PaneLayout.vue'
import PaneBody from '@/components/panes/primitives/PaneBody.vue'
import PaneSection from '@/components/panes/primitives/PaneSection.vue'
import ModeToggle from '@/components/generation/ModeToggle.vue'
import ModelSelector from '@/components/generation/ModelSelector.vue'
import RefImageDropzone from '@/components/generation/RefImageDropzone.vue'
import DynamicForm from '@/components/generation/DynamicForm.vue'
import GenerationStatus from '@/components/generation/GenerationStatus.vue'

import { validateFormValues, type FormFieldConfig } from '@/lib/schema-to-form'
import { useGenerationStore } from '@/stores/generation'
import { useEngineStore } from '@/stores/engine'
import { useQueueStore } from '@/stores/queue'
import { useModelStore } from '@/stores/model'
import { useProviderStore } from '@/stores/provider'
import { useModelBrowsingStore } from '@/stores/model-browsing'
import type { CanonicalEndpointDef } from '@/types'

// ---------------------------------------------------------------------------
// Store access
// ---------------------------------------------------------------------------

const generationStore = useGenerationStore()
const engineStore = useEngineStore()
const queueStore = useQueueStore()
const modelStore = useModelStore()
const providerStore = useProviderStore()
const modelBrowsingStore = useModelBrowsingStore()

// ---------------------------------------------------------------------------
// Local state
// ---------------------------------------------------------------------------

const endpoint = ref<CanonicalEndpointDef | null>(null)
const validationErrors = ref<Record<string, string>>({})
const fieldsRef = ref<FormFieldConfig[]>([])

// ---------------------------------------------------------------------------
// Model availability check
// ---------------------------------------------------------------------------

const hasLocalModels = computed(() =>
  Object.values(modelStore.filesByModelId).some((f) => f.isReady)
)
const hasRemoteModels = computed(() =>
  Object.values(modelBrowsingStore.userModelsByProvider).some((models) => models.length > 0)
)
const hasAnyModels = computed(() => hasLocalModels.value || hasRemoteModels.value)

// ---------------------------------------------------------------------------
// Generation readiness
// ---------------------------------------------------------------------------

const prompt = computed(() => generationStore.prompt)
const requiresLocalEngine = computed(() => endpoint.value?.providerId === 'local')
const engineCanGenerate = computed(() => engineStore.status.state === 'ready' || engineStore.status.state === 'idle')
const generateDisabled = computed(
  () => !prompt.value.trim() || (requiresLocalEngine.value && !engineCanGenerate.value)
)

const isRemoteEndpoint = computed(() => endpoint.value?.executionMode === 'remote-async')
const isGenerating = computed(
  () => !!queueStore.activePhase || queueStore.items.some((q) => q.status === 'processing')
)

const showRefImages = computed(
  () => generationStore.generationMode === 'image-to-image' || generationStore.generationMode === 'image-to-video'
)

// ---------------------------------------------------------------------------
// Fetch endpoint schema on key change
// ---------------------------------------------------------------------------

watch(
  () => generationStore.endpointKey,
  async (key) => {
    const ep = await window.api.getGenerationEndpointSchema(key)
    if (ep) endpoint.value = ep
  },
  { immediate: true }
)

// ---------------------------------------------------------------------------
// DynamicForm callbacks
// ---------------------------------------------------------------------------

function handleFieldChange(key: string, value: unknown): void {
  generationStore.setFormValue(key, value)
  if (validationErrors.value[key]) {
    const next = { ...validationErrors.value }
    delete next[key]
    validationErrors.value = next
  }
}

function handleSetDefaults(defaults: Record<string, unknown>): void {
  generationStore.setFormValues(defaults)
}

function handleFieldsChange(fields: FormFieldConfig[]): void {
  fieldsRef.value = fields
}

// ---------------------------------------------------------------------------
// Submit
// ---------------------------------------------------------------------------

async function handleSubmit(): Promise<void> {
  const errors = validateFormValues(fieldsRef.value, generationStore.formValues)
  if (Object.keys(errors).length > 0) {
    validationErrors.value = errors
    return
  }

  const built = generationStore.buildParams()
  if (!built.params.prompt?.trim()) return

  const genId = await window.api.submitGeneration(built)
  try {
    const gen = await window.api.timeline.get(genId)
    if (gen) generationStore.addGeneration(gen)
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// API status (inline for remote endpoints)
// ---------------------------------------------------------------------------

const apiProvider = computed(() => {
  const pid = endpoint.value?.providerId
  if (!pid) return null
  return providerStore.providers.find((p) => p.providerId === pid) ?? null
})

const apiKeyPresent = computed(() => {
  const pid = endpoint.value?.providerId
  return pid ? (providerStore.hasApiKey[pid] ?? false) : false
})

const apiConnStatus = computed(() => {
  const pid = endpoint.value?.providerId
  return pid ? providerStore.connectionStatus[pid] : undefined
})
</script>

<template>
  <PaneLayout title="Generate">
    <PaneBody>
      <!-- No models available — prompt to set up -->
      <template v-if="!hasAnyModels">
        <div class="flex flex-col items-center gap-3 py-8 text-center">
          <Icon icon="lucide:download" class="size-8 text-muted" />
          <div>
            <p class="text-sm font-medium">No models available</p>
            <p class="mt-1 text-xs text-muted">
              Open the Model Manager to download a model or add an API provider.
            </p>
          </div>
        </div>
      </template>

      <!-- Main generation form -->
      <template v-else>
        <div class="space-y-4">
          <ModeToggle />
          <ModelSelector />

          <!-- Reference images -->
          <PaneSection v-if="showRefImages" title="Reference Images">
            <RefImageDropzone />
          </PaneSection>

          <!-- Prompt -->
          <PaneSection title="Prompt">
            <Textarea
              data-focus-prompt="true"
              placeholder="Describe what you want to generate…"
              :model-value="prompt"
              rows="3"
              auto-resize
              class="w-full resize-none text-sm"
              @update:model-value="(v: string) => generationStore.setFormValue('prompt', v)"
              @keydown.meta.enter.prevent="handleSubmit"
              @keydown.ctrl.enter.prevent="handleSubmit"
            />
            <p v-if="validationErrors.prompt" class="mt-1 text-xs text-red-400">
              {{ validationErrors.prompt }}
            </p>
          </PaneSection>

          <!-- Dynamic form fields -->
          <DynamicForm
            v-if="endpoint"
            :endpoint="endpoint"
            :values="generationStore.formValues"
            :validation-errors="validationErrors"
            @change="handleFieldChange"
            @set-defaults="handleSetDefaults"
            @fields-change="handleFieldsChange"
          />
          <div v-else class="py-4 text-center text-sm text-muted">Loading schema…</div>

          <!-- Generate button -->
          <Button
            type="button"
            class="w-full"
            :disabled="generateDisabled"
            @click="handleSubmit"
          >
            <template v-if="isGenerating">
              <Icon icon="lucide:loader-2" class="size-4 animate-spin" />
              Generating
            </template>
            <template v-else>Generate</template>
          </Button>

          <!-- Status: local engine or API mode -->
          <template v-if="isRemoteEndpoint && endpoint?.providerId">
            <div class="rounded-lg border border-default bg-elevated p-3">
              <div class="flex items-center gap-2">
                <Icon icon="lucide:wifi" class="size-3.5 text-muted shrink-0" />
                <span class="text-xs text-muted flex-1">
                  {{ isGenerating
                    ? `Sending to ${apiProvider?.displayName ?? endpoint.providerId}…`
                    : `API Mode — ${apiProvider?.displayName ?? endpoint.providerId}` }}
                </span>
                <Tag
                  v-if="apiConnStatus?.status === 'success'"
                  severity="success"
                  class="text-[10px]"
                  value="Connected"
                />
                <Tag
                  v-if="apiConnStatus?.status === 'error'"
                  severity="danger"
                  class="text-[10px]"
                  :value="'API Error'"
                  v-tooltip.top="apiConnStatus.message"
                />
                <Tag
                  v-if="!apiKeyPresent"
                  severity="warn"
                  class="text-[10px]"
                  value="No API Key"
                />
              </div>
            </div>
          </template>
          <GenerationStatus v-else />
        </div>
      </template>
    </PaneBody>
  </PaneLayout>
</template>