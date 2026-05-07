<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Divider from 'primevue/divider'
import SelectButton from 'primevue/selectbutton'

import { useModelStore } from '@/stores/model'
import { useUIStore } from '@/stores/ui'
import { useUpscaleStore } from '@/stores/upscale'
import type {
  AppSettings,
  LocalGenerationBackend,
  SettingsUpdate,
  UpscaleBackendPreference
} from '@/types'

const uiStore = useUIStore()
const modelStore = useModelStore()
const upscaleStore = useUpscaleStore()

const open = computed({
  get: () => uiStore.activeModals.includes('settings'),
  set: (val: boolean) => {
    if (!val) uiStore.closeModal('settings')
  }
})

const loaded = ref<AppSettings | null>(null)
const draft = ref<AppSettings | null>(null)
const saving = ref(false)
const error = ref<string | null>(null)

const showEnginePath = import.meta.env.DEV

const onOffOptions = [
  { label: 'On', value: true },
  { label: 'Off', value: false }
]

const upscaleBackendOptions = [
  { label: 'Auto', value: 'auto' },
  { label: 'ONNX', value: 'onnx' },
  { label: 'cn-engine', value: 'cn-engine' }
]

const localGenerationBackendOptions = [
  { label: 'cn-engine', value: 'cn-engine' },
  { label: 'stable-diffusion.cpp', value: 'stable-diffusion.cpp' }
]

// Load settings when modal opens, reset when it closes
watch(open, async (isOpen) => {
  if (!isOpen) {
    loaded.value = null
    draft.value = null
    saving.value = false
    error.value = null
    return
  }

  saving.value = false
  error.value = null

  try {
    const s = await window.api.getSettings()
    loaded.value = s
    draft.value = { ...s }
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
})

function update<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
  if (draft.value) draft.value = { ...draft.value, [key]: value }
}

async function browseFolder(title: string, key: keyof AppSettings): Promise<void> {
  const paths = await window.api.showOpenDialog({ title, properties: ['openDirectory'] })
  if (paths && paths.length > 0 && paths[0]) {
    update(key, paths[0] as AppSettings[typeof key])
  }
}

async function browseFile(title: string, key: keyof AppSettings): Promise<void> {
  const paths = await window.api.showOpenDialog({ title, properties: ['openFile'] })
  if (paths && paths.length > 0 && paths[0]) {
    update(key, paths[0] as AppSettings[typeof key])
  }
}

async function onSave(): Promise<void> {
  if (!draft.value) return
  saving.value = true
  error.value = null

  try {
    const modelBasePathChanged = draft.value.model_base_path !== loaded.value?.model_base_path
    const upscaleBackendChanged = draft.value.upscale_backend !== loaded.value?.upscale_backend

    const updates: SettingsUpdate = {
      library_root: draft.value.library_root,
      engine_path: draft.value.engine_path,
      sd_cpp_server_path: draft.value.sd_cpp_server_path,
      model_base_path: draft.value.model_base_path,
      upscale_backend: draft.value.upscale_backend,
      local_generation_backend: draft.value.local_generation_backend,
      offload_to_cpu: draft.value.offload_to_cpu,
      flash_attn: draft.value.flash_attn,
      vae_on_cpu: draft.value.vae_on_cpu,
      llm_on_cpu: draft.value.llm_on_cpu,
      confirm_before_delete: draft.value.confirm_before_delete
    }

    await window.api.saveSettings(updates)

    if (modelBasePathChanged) await modelStore.hydrate()
    else await modelStore.refreshSettings()
    if (upscaleBackendChanged) await upscaleStore.loadModels()

    uiStore.closeModal('settings')
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Dialog v-model:visible="open" modal :style="{ width: '720px' }" :closable="true">
    <template #header>
      <div class="flex items-center gap-2">
        <Icon icon="lucide:settings" class="size-5" />
        <span class="font-semibold">Settings</span>
      </div>
    </template>

    <p class="mb-4 text-sm text-muted">
      Library location, model directory, and engine runtime flags.
    </p>

    <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
      <!-- Left column: Paths -->
      <div class="space-y-4">
        <div class="text-xs font-medium uppercase tracking-wide text-muted">Paths</div>

        <!-- Library root -->
        <div class="space-y-1.5">
          <label class="text-xs font-medium text-muted">Library root</label>
          <div class="flex items-center gap-2">
            <InputText
              :model-value="draft?.library_root ?? ''"
              placeholder="C:\Users\...\Distillery\Library"
              class="w-full"
              @update:model-value="update('library_root', String($event))"
            />
            <Button
              severity="secondary"
              size="small"
              @click="browseFolder('Choose library root', 'library_root')"
            >
              <Icon icon="lucide:folder-open" class="size-4" />
            </Button>
          </div>
        </div>

        <!-- Engine path (dev only) -->
        <div v-if="showEnginePath" class="space-y-1.5">
          <label class="text-xs font-medium text-muted">Engine base path (dev)</label>
          <div class="flex items-center gap-2">
            <InputText
              :model-value="draft?.engine_path ?? ''"
              placeholder="C:\path\to\resources\cn-engine\win32\vulkan"
              class="w-full"
              @update:model-value="update('engine_path', String($event))"
            />
            <Button
              severity="secondary"
              size="small"
              @click="browseFolder('Choose cn-engine directory', 'engine_path')"
            >
              <Icon icon="lucide:folder-open" class="size-4" />
            </Button>
          </div>
        </div>

        <!-- stable-diffusion.cpp path (dev only) -->
        <div v-if="showEnginePath" class="space-y-1.5">
          <label class="text-xs font-medium text-muted"
            >stable-diffusion.cpp server path (dev)</label
          >
          <div class="flex items-center gap-2">
            <InputText
              :model-value="draft?.sd_cpp_server_path ?? ''"
              placeholder="/path/to/resources/sd-cpp/mac/sd-server"
              class="w-full"
              @update:model-value="update('sd_cpp_server_path', String($event))"
            />
            <Button
              severity="secondary"
              size="small"
              @click="browseFile('Choose stable-diffusion.cpp server path', 'sd_cpp_server_path')"
            >
              <Icon icon="lucide:folder-open" class="size-4" />
            </Button>
          </div>
        </div>

        <!-- Model directory -->
        <div class="space-y-1.5">
          <label class="text-xs font-medium text-muted">Model directory</label>
          <div class="flex items-center gap-2">
            <InputText
              :model-value="draft?.model_base_path ?? ''"
              placeholder="C:\Users\...\AppData\Roaming\distillery\models"
              class="w-full"
              @update:model-value="update('model_base_path', String($event))"
            />
            <Button
              severity="secondary"
              size="small"
              @click="browseFolder('Choose model directory', 'model_base_path')"
            >
              <Icon icon="lucide:folder-open" class="size-4" />
            </Button>
          </div>
        </div>

        <!-- Upscale backend -->
        <div class="space-y-1.5">
          <label class="text-xs font-medium text-muted">Local generation backend</label>
          <SelectButton
            :model-value="draft?.local_generation_backend ?? 'cn-engine'"
            :options="localGenerationBackendOptions"
            option-label="label"
            option-value="value"
            @update:model-value="
              update('local_generation_backend', $event as LocalGenerationBackend)
            "
          />
        </div>

        <!-- Upscale backend -->
        <div class="space-y-1.5">
          <label class="text-xs font-medium text-muted">Upscale backend</label>
          <SelectButton
            :model-value="draft?.upscale_backend ?? 'auto'"
            :options="upscaleBackendOptions"
            option-label="label"
            option-value="value"
            @update:model-value="update('upscale_backend', $event as UpscaleBackendPreference)"
          />
        </div>
      </div>

      <!-- Right column: Engine flags + behavior -->
      <div class="space-y-4">
        <div class="text-xs font-medium uppercase tracking-wide text-muted">Engine Flags</div>

        <div class="space-y-3">
          <div class="space-y-1.5">
            <label class="text-xs font-medium text-muted">Offload to CPU</label>
            <SelectButton
              :model-value="draft?.offload_to_cpu ?? true"
              :options="onOffOptions"
              option-label="label"
              option-value="value"
              @update:model-value="update('offload_to_cpu', Boolean($event))"
            />
          </div>

          <div class="space-y-1.5">
            <label class="text-xs font-medium text-muted">Flash attention</label>
            <SelectButton
              :model-value="draft?.flash_attn ?? true"
              :options="onOffOptions"
              option-label="label"
              option-value="value"
              @update:model-value="update('flash_attn', Boolean($event))"
            />
          </div>

          <div class="space-y-1.5">
            <label class="text-xs font-medium text-muted">VAE on CPU</label>
            <SelectButton
              :model-value="draft?.vae_on_cpu ?? false"
              :options="onOffOptions"
              option-label="label"
              option-value="value"
              @update:model-value="update('vae_on_cpu', Boolean($event))"
            />
          </div>

          <div class="space-y-1.5">
            <label class="text-xs font-medium text-muted">LLM on CPU</label>
            <SelectButton
              :model-value="draft?.llm_on_cpu ?? false"
              :options="onOffOptions"
              option-label="label"
              option-value="value"
              @update:model-value="update('llm_on_cpu', Boolean($event))"
            />
          </div>
        </div>

        <Divider />

        <div class="text-xs font-medium uppercase tracking-wide text-muted">Behavior</div>

        <div class="space-y-1.5">
          <label class="text-xs font-medium text-muted">Confirm before delete</label>
          <SelectButton
            :model-value="draft?.confirm_before_delete ?? true"
            :options="onOffOptions"
            option-label="label"
            option-value="value"
            @update:model-value="update('confirm_before_delete', Boolean($event))"
          />
        </div>

        <Divider />

        <div v-if="error" class="text-sm text-red-400">{{ error }}</div>
        <div v-if="!loaded && open" class="text-sm text-muted">Loading…</div>
      </div>
    </div>

    <template #footer>
      <Button
        severity="secondary"
        :disabled="saving"
        label="Cancel"
        @click="uiStore.closeModal('settings')"
      />
      <Button
        :disabled="!draft || saving"
        :loading="saving"
        :label="saving ? 'Saving…' : 'Save'"
        @click="onSave"
      />
    </template>
  </Dialog>
</template>
