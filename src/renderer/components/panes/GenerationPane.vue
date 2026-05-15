<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import Tag from 'primevue/tag'
import { useToast } from 'primevue/usetoast'

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
import { usePromptStore } from '@/stores/prompt'
import { useUIStore } from '@/stores/ui'
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
const promptStore = usePromptStore()
const uiStore = useUIStore()
const toast = useToast()

// ---------------------------------------------------------------------------
// Local state
// ---------------------------------------------------------------------------

const endpoint = ref<CanonicalEndpointDef | null>(null)
const endpointLoading = ref(false)
const endpointError = ref<string | null>(null)
const validationErrors = ref<Record<string, string>>({})
const fieldsRef = ref<FormFieldConfig[]>([])
const showSavePromptForm = ref(false)
const savePromptTitle = ref('')
const savePromptPending = ref(false)

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
const localBackend = computed(
  () => modelStore.settings?.local_generation_backend ?? 'stable-diffusion.cpp'
)
const isLocalEndpoint = computed(() => endpoint.value?.providerId === 'local')
const requiresLocalEngine = computed(
  () => isLocalEndpoint.value && localBackend.value === 'cn-engine'
)
const engineCanGenerate = computed(
  () => engineStore.status.state === 'ready' || engineStore.status.state === 'idle'
)
const localModelReady = computed(() =>
  isLocalEndpoint.value && endpoint.value
    ? (modelStore.filesByModelId[endpoint.value.providerModelId]?.isReady ?? false)
    : true
)
const sdCppCanGenerate = computed(
  () =>
    !isLocalEndpoint.value ||
    localBackend.value !== 'stable-diffusion.cpp' ||
    (localModelReady.value && !!modelStore.settings?.sd_cpp_server_path?.trim())
)
const requiresRefImage = computed(
  () =>
    generationStore.generationMode === 'image-to-image' ||
    generationStore.generationMode === 'image-to-video'
)
const isRemoteEndpoint = computed(() => endpoint.value?.executionMode === 'remote-async')
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
const endpointReady = computed(
  () => !!endpoint.value && endpoint.value.endpointKey === generationStore.endpointKey
)
const generateBlockReason = computed(() => {
  if (!endpointReady.value) {
    return endpointError.value ?? 'Loading selected model settings.'
  }
  if (!prompt.value.trim()) return 'Enter a prompt to generate.'
  if (requiresLocalEngine.value && !engineCanGenerate.value) {
    return `Local engine is ${engineStore.status.state}.`
  }
  if (isLocalEndpoint.value && !localModelReady.value) {
    return 'Download the selected local model before generating.'
  }
  if (!sdCppCanGenerate.value) {
    return 'Set a stable-diffusion.cpp server path before generating locally.'
  }
  if (isRemoteEndpoint.value && !apiKeyPresent.value) {
    return `Add an API key for ${apiProvider.value?.displayName ?? endpoint.value?.providerId ?? 'this provider'}.`
  }
  if (requiresRefImage.value && generationStore.refImages.length === 0) {
    return 'Add a reference image for this mode.'
  }
  return null
})
const generateDisabled = computed(() => !!generateBlockReason.value)

const isGenerating = computed(
  () => !!queueStore.activePhase || queueStore.items.some((q) => q.status === 'processing')
)

const showRefImages = computed(() => requiresRefImage.value)

// ---------------------------------------------------------------------------
// Fetch endpoint schema on key change
// ---------------------------------------------------------------------------

watch(
  () => generationStore.endpointKey,
  async (key) => {
    endpoint.value = null
    endpointError.value = null
    endpointLoading.value = true
    fieldsRef.value = []
    validationErrors.value = {}

    try {
      const ep = await window.api.getGenerationEndpointSchema(key)
      if (generationStore.endpointKey !== key) return

      endpoint.value = ep
      if (!ep) {
        endpointError.value = `No generation endpoint found for ${key}`
      }
    } catch (error) {
      if (generationStore.endpointKey !== key) return
      endpointError.value = error instanceof Error ? error.message : String(error)
    } finally {
      if (generationStore.endpointKey === key) {
        endpointLoading.value = false
      }
    }
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
  if (generateBlockReason.value) {
    toast.add({
      severity: 'warn',
      summary: 'Generation unavailable',
      detail: generateBlockReason.value,
      life: 3000
    })
    return
  }

  const errors = validateFormValues(fieldsRef.value, generationStore.formValues)
  if (Object.keys(errors).length > 0) {
    validationErrors.value = errors
    const firstError = Object.values(errors)[0]
    toast.add({
      severity: 'warn',
      summary: 'Check generation settings',
      detail: firstError,
      life: 3000
    })
    return
  }

  if (requiresRefImage.value && generationStore.refImages.length === 0) {
    toast.add({
      severity: 'warn',
      summary: 'Reference image required',
      detail: 'Add a reference image before submitting this generation mode.',
      life: 3000
    })
    return
  }

  const built = generationStore.buildParams()
  if (!built.params.prompt?.trim()) return

  try {
    const genId = await window.api.submitGeneration(built)
    const gen = await window.api.timeline.get(genId)
    if (gen) generationStore.addGeneration(gen)
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: 'Generation failed',
      detail: error instanceof Error ? error.message : String(error),
      life: 4000
    })
  }
}

function openPromptEditor(): void {
  uiStore.openModal('prompt-editor')
}

function openSavePromptForm(): void {
  if (!prompt.value.trim()) return
  showSavePromptForm.value = true
  savePromptTitle.value = ''
}

function cancelSavePrompt(): void {
  showSavePromptForm.value = false
  savePromptTitle.value = ''
}

async function handleSavePrompt(): Promise<void> {
  if (!prompt.value.trim() || savePromptPending.value) return

  savePromptPending.value = true

  try {
    const created = await promptStore.createPrompt({
      text: prompt.value,
      title: savePromptTitle.value.trim() || undefined
    })

    cancelSavePrompt()
    toast.add({
      severity: 'success',
      summary: 'Prompt saved',
      detail: created.title ?? 'Saved to prompt library',
      life: 3000
    })
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: 'Save failed',
      detail: error instanceof Error ? error.message : String(error),
      life: 3500
    })
  } finally {
    savePromptPending.value = false
  }
}

// ---------------------------------------------------------------------------
// API status is rendered inline for remote endpoints.
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
            <div class="relative">
              <Textarea
                data-focus-prompt="true"
                placeholder="Describe what you want to generate…"
                :model-value="prompt"
                rows="3"
                auto-resize
                class="w-full resize-none pr-24 text-sm"
                @update:model-value="(v: string) => generationStore.setFormValue('prompt', v)"
                @keydown.meta.enter.prevent="handleSubmit"
                @keydown.ctrl.enter.prevent="handleSubmit"
              />

              <div class="absolute right-1 top-1 flex items-center gap-1">
                <Button
                  v-tooltip.top="'Save prompt to library'"
                  type="button"
                  text
                  plain
                  severity="secondary"
                  size="small"
                  :disabled="!prompt.trim()"
                  @click="openSavePromptForm"
                >
                  <Icon icon="lucide:bookmark-plus" class="size-3.5" />
                </Button>
                <Button
                  v-tooltip.top="'Open prompt editor'"
                  type="button"
                  text
                  plain
                  severity="secondary"
                  size="small"
                  @click="openPromptEditor"
                >
                  <Icon icon="lucide:pen-square" class="size-3.5" />
                </Button>
              </div>
            </div>

            <p v-if="validationErrors.prompt" class="mt-1 text-xs text-red-400">
              {{ validationErrors.prompt }}
            </p>

            <div
              v-if="showSavePromptForm"
              class="mt-3 rounded-lg border border-default bg-elevated p-3"
            >
              <div class="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div class="flex-1">
                  <label class="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">
                    Title
                  </label>
                  <InputText
                    v-model="savePromptTitle"
                    class="w-full"
                    maxlength="120"
                    placeholder="Optional title"
                    @keydown.enter.prevent="handleSavePrompt"
                  />
                </div>

                <div class="flex items-center gap-2">
                  <Button
                    type="button"
                    label="Cancel"
                    severity="secondary"
                    outlined
                    size="small"
                    :disabled="savePromptPending"
                    @click="cancelSavePrompt"
                  />
                  <Button
                    type="button"
                    label="Save"
                    size="small"
                    :loading="savePromptPending"
                    :disabled="!prompt.trim()"
                    @click="handleSavePrompt"
                  />
                </div>
              </div>
            </div>
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
          <div v-else class="py-4 text-center text-sm text-muted">
            {{
              endpointLoading ? 'Loading schema…' : (endpointError ?? 'Select a model to generate.')
            }}
          </div>

          <!-- Generate button -->
          <Button type="button" class="w-full" :disabled="generateDisabled" @click="handleSubmit">
            <template v-if="isGenerating">
              <Icon icon="lucide:loader-2" class="size-4 animate-spin" />
              Generating
            </template>
            <template v-else>Generate</template>
          </Button>
          <p v-if="generateBlockReason" class="text-xs text-muted">
            {{ generateBlockReason }}
          </p>

          <!-- Status: local engine or API mode -->
          <template v-if="isRemoteEndpoint && endpoint?.providerId">
            <div class="rounded-lg border border-default bg-elevated p-3">
              <div class="flex items-center gap-2">
                <Icon icon="lucide:wifi" class="size-3.5 text-muted shrink-0" />
                <span class="text-xs text-muted flex-1">
                  {{
                    isGenerating
                      ? `Sending to ${apiProvider?.displayName ?? endpoint.providerId}…`
                      : `API Mode — ${apiProvider?.displayName ?? endpoint.providerId}`
                  }}
                </span>
                <Tag
                  v-if="apiConnStatus?.status === 'success'"
                  severity="success"
                  class="text-[10px]"
                  value="Connected"
                />
                <Tag
                  v-if="apiConnStatus?.status === 'error'"
                  v-tooltip.top="apiConnStatus.message"
                  severity="danger"
                  class="text-[10px]"
                  :value="'API Error'"
                />
                <Tag v-if="!apiKeyPresent" severity="warn" class="text-[10px]" value="No API Key" />
              </div>
            </div>
          </template>
          <GenerationStatus v-else />
        </div>
      </template>
    </PaneBody>
  </PaneLayout>
</template>
